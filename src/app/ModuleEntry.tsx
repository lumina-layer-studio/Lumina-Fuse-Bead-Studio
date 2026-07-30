import {
  applyWorkshopUiState,
  connectWorkshop,
  type WorkshopClient,
} from "@lumina/workshop-sdk";
import { useEffect, useState } from "react";

import type { BeadImageCodec } from "../host/imageCodec";
import { normalizeLocale } from "../i18n/translations";
import { StatusBanner } from "../ui/panelPrimitives";
import {
  BeadWorkshopModule,
  type BeadProcessingEngine,
} from "./BeadWorkshopModule";

type ConnectFunction = () => Promise<WorkshopClient>;

interface ModuleEntryProps {
  connect?: ConnectFunction;
  createEngine?: () => BeadProcessingEngine;
  imageCodec?: BeadImageCodec;
  autosaveDelayMs?: number;
}

const connectToLumina: ConnectFunction = () =>
  connectWorkshop({
    moduleId: "lumina.bead-pattern",
    moduleVersion: "1.0.0",
  });

export function ModuleEntry({
  connect = connectToLumina,
  createEngine,
  imageCodec,
  autosaveDelayMs,
}: ModuleEntryProps) {
  const [connection, setConnection] = useState<{
    client: WorkshopClient;
    locale: "zh-CN" | "en-US";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let connectedClient: WorkshopClient | null = null;
    const start = async () => {
      try {
        const client = await connect();
        connectedClient = client;
        const ui = await client.ui.getState();
        if (!active) {
          client.close();
          return;
        }
        applyWorkshopUiState(ui);
        setConnection({
          client,
          locale: normalizeLocale(ui.locale),
        });
      } catch {
        if (active) {
          setError(
            "无法连接 Lumina 创意工坊宿主。请关闭此模块后重试。 / Unable to connect to the Lumina Workshop host.",
          );
        }
      }
    };
    void start();
    return () => {
      active = false;
      connectedClient?.close();
    };
  }, [connect]);

  if (error) {
    return (
      <main className="module-shell">
        <StatusBanner tone="error">{error}</StatusBanner>
      </main>
    );
  }

  if (!connection) {
    return (
      <main className="module-shell">
        <StatusBanner>拼豆工作台正在连接 Lumina…</StatusBanner>
      </main>
    );
  }

  return (
    <BeadWorkshopModule
      client={connection.client}
      locale={connection.locale}
      createEngine={createEngine}
      imageCodec={imageCodec}
      autosaveDelayMs={autosaveDelayMs}
    />
  );
}
