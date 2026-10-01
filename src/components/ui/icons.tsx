import {
  AlertTriangle,
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Container,
  DoorOpen,
  FileCode2,
  Gauge,
  HardDrive,
  Layers,
  LayoutDashboard,
  Lock,
  LockOpen,
  Network,
  Route,
  Server,
  Settings2,
  ShieldCheck,
  Signal,
  Unplug,
  Sliders,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ResourceStatus } from "@/lib/types";

/**
 * Ícones no lugar dos quadradinhos coloridos.
 *
 * Vale mais do que estética: o guia de dataviz exige que cor de status venha
 * acompanhada de ícone + rótulo, para o significado nunca depender só do
 * matiz. Aqui a forma carrega o estado — ✓, △, ✕ e ○ se distinguem em
 * escala de cinza, no daltonismo e em modo de alto contraste.
 */
export const STATUS_ICON: Record<ResourceStatus, { Icon: LucideIcon; tone: string; label: string }> = {
  enabled: { Icon: CheckCircle2, tone: "text-ok", label: "ativo" },
  warning: { Icon: AlertTriangle, tone: "text-warn", label: "atenção" },
  error: { Icon: XCircle, tone: "text-down", label: "erro" },
  disabled: { Icon: CircleDashed, tone: "text-muted", label: "inativo" },
};

/** Ícone por tipo de provider — reconhecível de relance na tabela. */
export function providerIcon(provider: string | undefined): LucideIcon {
  if (!provider) return Boxes;
  if (provider.startsWith("docker")) return Container;
  if (provider.startsWith("file")) return FileCode2;
  if (provider.startsWith("internal")) return Settings2;
  if (provider.startsWith("kubernetes")) return Network;
  return Boxes;
}

export {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  DoorOpen,
  Gauge,
  HardDrive,
  Layers,
  LayoutDashboard,
  Lock,
  LockOpen,
  Route,
  Server,
  ShieldCheck,
  Signal,
  Unplug,
  Sliders,
};
export type { LucideIcon };
