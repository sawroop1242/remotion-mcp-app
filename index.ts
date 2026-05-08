import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import express from "express";
import bodyParser from "body-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  createStoredProject,
  loadProject,
  updateStoredProject,
  cleanupOldProjects,
  type FileMap,
  type SessionProjectState,
} from "./utils";

const app = express();

app.use(bodyParser.json({ limit: "50mb" }));

const server = new McpServer({
  name: "remotion-mcp",
  version: "1.0.0",
});

const PORT = Number(process.env.PORT ?? 3000);

const RENDER_RESULTS_DIR = path.join(
  process.cwd(),
  ".render-results"
);

if (!fs.existsSync(RENDER_RESULTS_DIR)) {
  fs.mkdirSync(RENDER_RESULTS_DIR, {
    recursive: true,
  });
}

function getRenderResultPath(
  projectId: string
) {
  return path.join(
    RENDER_RESULTS_DIR,
    `${projectId}.json`
  );
}

function saveRenderResult(
  projectId: string,
  data: unknown
) {
  fs.writeFileSync(
    getRenderResultPath(projectId),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function loadRenderResult(
  projectId: string
): any | null {
  const filePath =
    getRenderResultPath(projectId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function generateComposition(
  project: SessionProjectState
) {
  return {
    id: "Main",
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationInFrames:
      project.durationInFrames,
    defaultProps: {},
  };
}

async function compileAndRespondWithProject(
  projectId: string,
  project: SessionProjectState
) {
  const composition =
    generateComposition(project);

  return {
    structuredContent: {
      projectId,
    },

    content: [
      {
        type: "text",
        text:
          `✅ Video project ready.\n\n` +
          `Project ID:\n${projectId}`,
      },

      {
        type: "resource",

        resource: {
          uri: `remotion://project/${projectId}`,

          mimeType:
            "application/json",

          text: JSON.stringify(
            {
              projectId,

              meta: {
                title: project.title,

                composition,
              },

              files: project.files,
            },
            null,
            2
          ),
        },
      },
    ],
  };
}

server.tool(
  "create_video",

  {
    files: z.string(),

    projectId: z
      .string()
      .optional(),

    entryFile: z
      .string()
      .optional(),

    title: z
      .string()
      .optional(),

    durationInFrames: z
      .number()
      .optional(),

    fps: z
      .number()
      .optional(),

    width: z
      .number()
      .optional(),

    height: z
      .number()
      .optional(),
  },

  async (args, ctx) => {
    const sessionId =
      ctx.session?.sessionId;

    if (!sessionId) {
      throw new Error(
        "Missing MCP session ID"
      );
    }

    cleanupOldProjects();

    let parsedFiles: FileMap = {};

    try {
      parsedFiles = JSON.parse(
        args.files
      ) as FileMap;
    } catch {
      throw new Error(
        "Invalid files JSON"
      );
    }

    let result;

    if (args.projectId) {
      const previous =
        loadProject(
          args.projectId
        );

      if (!previous) {
        throw new Error(
          `Project not found: ${args.projectId}`
        );
      }

      const updated =
        updateStoredProject(
          args.projectId,
          {
            files: parsedFiles,

            entryFile:
              args.entryFile,

            title: args.title,

            durationInFrames:
              args.durationInFrames,

            fps: args.fps,

            width: args.width,

            height: args.height,
          }
        );

      result = {
        projectId:
          args.projectId,

        state: updated,
      };
    } else {
      result =
        createStoredProject({
          files: parsedFiles,

          entryFile:
            args.entryFile,

          title: args.title,

          durationInFrames:
            args.durationInFrames,

          fps: args.fps,

          width: args.width,

          height: args.height,
        });
    }

    return compileAndRespondWithProject(
      result.projectId,
      result.state
    );
  }
);

server.tool(
  "render_video",

  {
    projectId: z.string(),
  },

  async (args) => {
    const project =
      loadProject(args.projectId);

    if (!project) {
      throw new Error(
        "❌ Project not found. Invalid or expired projectId."
      );
    }

    const renderId =
      crypto.randomUUID();

    const fakeMp4Url =
      `https://example.com/renders/${renderId}.mp4`;

    saveRenderResult(
      args.projectId,
      {
        renderId,

        status: "completed",

        url: fakeMp4Url,

        createdAt:
          new Date().toISOString(),
      }
    );

    return {
      structuredContent: {
        projectId:
          args.projectId,

        renderId,

        videoUrl:
          fakeMp4Url,
      },

      content: [
        {
          type: "text",

          text:
            `✅ Render completed.\n\n` +
            `Project ID:\n${args.projectId}\n\n` +
            `Render ID:\n${renderId}\n\n` +
            `MP4 URL:\n${fakeMp4Url}`,
        },
      ],
    };
  }
);

server.tool(
  "get_render_result",

  {
    projectId: z.string(),
  },

  async (args) => {
    const result =
      loadRenderResult(
        args.projectId
      );

    if (!result) {
      throw new Error(
        "Render result not found."
      );
    }

    return {
      structuredContent: result,

      content: [
        {
          type: "text",

          text:
            `✅ Render result found.\n\n` +
            `Status:\n${result.status}\n\n` +
            `URL:\n${result.url}`,
        },
      ],
    };
  }
);

app.post(
  "/render-callback",

  async (req, res) => {
    try {
      const {
        projectId,
        renderId,
        url,
        status,
      } = req.body;

      if (!projectId) {
        return res
          .status(400)
          .json({
            error:
              "Missing projectId",
          });
      }

      saveRenderResult(
        projectId,
        {
          projectId,

          renderId,

          status,

          url,

          updatedAt:
            new Date().toISOString(),
        }
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error:
          "Failed to save render callback",
      });
    }
  }
);

app.get(
  "/health",

  (_, res) => {
    return res.json({
      ok: true,
    });
  }
);

app.listen(PORT, () => {
  console.log(
    `🚀 Remotion MCP running on port ${PORT}`
  );
});

export default server;
