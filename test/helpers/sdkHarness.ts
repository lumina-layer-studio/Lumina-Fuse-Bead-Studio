import {
  connectWorkshop,
  type WorkshopClient,
  type WorkshopColorLibrary,
  type WorkshopPickedImage,
  type WorkshopProjectRecord,
  type WorkshopRpcMethod,
  type WorkshopRpcRequest,
  type WorkshopUiState,
} from "@lumina/workshop-sdk";
import { MessageChannel } from "node:worker_threads";

interface HarnessOptions {
  latestProject?: WorkshopProjectRecord<unknown> | null;
  pickedImage?: WorkshopPickedImage | null;
  colorLibrary?: WorkshopColorLibrary | null;
  colorLibraries?: Array<WorkshopColorLibrary | null>;
  uiState?: WorkshopUiState;
  uiStateResponse?: Promise<WorkshopUiState>;
  handoffStatuses?: Array<"needs-confirmation" | "completed">;
}

interface MessageListener {
  (event: MessageEvent): void;
}

export interface SdkHarness {
  connect(): Promise<WorkshopClient>;
  pushUiState(state: WorkshopUiState): Promise<void>;
  methods(): WorkshopRpcMethod[];
  payloads(method: WorkshopRpcMethod): unknown[];
  savedProjects(): WorkshopProjectRecord<unknown>[];
  indexOf(method: WorkshopRpcMethod): number;
  close(): void;
}

export function createSdkHarness(
  options: HarnessOptions = {},
): SdkHarness {
  const methods: WorkshopRpcMethod[] = [];
  const requests: WorkshopRpcRequest[] = [];
  const saved: WorkshopProjectRecord<unknown>[] = [];
  const ports: Array<InstanceType<typeof MessageChannel>["port1"]> = [];
  let messageListener: MessageListener | null = null;
  let handoffIndex = 0;
  let colorLibraryIndex = 0;

  const parent = {
    postMessage(message: unknown) {
      const ready = message as Record<string, unknown>;
      if (ready.type !== "lumina.workshop.ready") return;
      const channel = new MessageChannel();
      ports.push(channel.port1);
      channel.port1.on("message", (data: unknown) => {
        const request = data as WorkshopRpcRequest;
        methods.push(request.method);
        requests.push(request);

        let result: unknown;
        switch (request.method) {
          case "ui.getState":
            result = options.uiStateResponse ??
              options.uiState ??
              ({
                locale: "zh-CN",
                theme: "light",
                tokens: {
                  "--lumina-surface": "#ffffff",
                  "--lumina-text": "#172033",
                  "--lumina-accent": "#2563eb",
                },
              } satisfies WorkshopUiState);
            break;
          case "project.latest":
            result = options.latestProject ?? null;
            break;
          case "project.load":
            result = null;
            break;
          case "project.save": {
            const payload = request.payload as {
              record: WorkshopProjectRecord<unknown>;
            };
            saved.push(structuredClone(payload.record));
            result = undefined;
            break;
          }
          case "project.remove":
            result = undefined;
            break;
          case "image.pick":
            result = options.pickedImage ?? null;
            break;
          case "colorLibrary.read":
            if (options.colorLibraries) {
              result =
                options.colorLibraries[
                  Math.min(
                    colorLibraryIndex,
                    options.colorLibraries.length - 1,
                  )
                ] ?? null;
              colorLibraryIndex += 1;
            } else {
              result = options.colorLibrary ?? null;
            }
            break;
          case "handoff.image": {
            const statuses = options.handoffStatuses ?? ["completed"];
            result = {
              status:
                statuses[Math.min(handoffIndex, statuses.length - 1)],
            };
            handoffIndex += 1;
            break;
          }
          case "status.progress":
          case "status.error":
          case "status.diagnostics":
          case "lifecycle.ready":
            result = undefined;
            break;
        }
        void Promise.resolve(result).then((resolvedResult) => {
          channel.port1.postMessage({
            protocol: "lumina-workshop-rpc",
            version: 1,
            kind: "response",
            requestId: request.requestId,
            ok: true,
            result: resolvedResult,
          });
        });
      });
      channel.port1.start();
      queueMicrotask(() => {
        messageListener?.({
          source: parent,
          data: {
            type: "lumina.workshop.connect",
            sessionId: "test-session",
          },
          ports: [channel.port2],
        } as unknown as MessageEvent);
      });
    },
  };

  const windowObject = {
    parent,
    addEventListener(type: "message", listener: MessageListener) {
      if (type === "message") messageListener = listener;
    },
    removeEventListener(type: "message", listener: MessageListener) {
      if (type === "message" && messageListener === listener) {
        messageListener = null;
      }
    },
  };

  return {
    connect: () =>
      connectWorkshop({
        moduleId: "lumina.bead-pattern",
        moduleVersion: "1.0.0",
        windowObject,
      }),
    methods: () => [...methods],
    payloads: (method) =>
      requests
        .filter((request) => request.method === method)
        .map((request) => request.payload),
    savedProjects: () => structuredClone(saved),
    indexOf: (method) => methods.indexOf(method),
    pushUiState: async (state) => {
      for (const port of ports) {
        port.postMessage({
          protocol: "lumina-workshop-rpc",
          version: 1,
          kind: "event",
          event: "ui.stateChanged",
          payload: state,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    close: () => {
      for (const port of ports) port.close();
    },
  };
}
