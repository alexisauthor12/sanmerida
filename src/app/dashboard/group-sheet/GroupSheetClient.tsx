"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AdminUser = {
  userId?: string;
  email: string;
  nombre: string;
  isMember: boolean;
};

type CuotaMonitorClient = {
  id: string;
  nombre: string;
  documento: string;
  telefono: string;
  agencia: string;
  gestor: string;
  estado: "Al día" | "Con atraso" | "Riesgo";
  cuotasPendientes: number;
  cuotasVencidas: number;
  saldo: number;
  proximoVencimiento: string;
};

type CuotaMonitorProfile = {
  clientId: string;
  cedula: string;
  nombre?: string;
  apellido?: string;
  username?: string;
  plan: string;
  cuotaMensual: number;
  cuotasTotales: number;
  cuotasPagadas: number;
};

type GroupSheetClientProps = {
  initialGroup: string;
  initialPlanType: "26" | "83";
};

type CuotaMonitorInstallment = {
  clientId: string;
  numero: number;
  monto: number;
  recargo: number;
  estado: "Pendiente" | "Vencida" | "Por vencer" | "Pagada";
};

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE || "";

const GROUP_CAPACITY_26 = 26;
const GROUP_CAPACITY_83 = 83;

function isCiclon83Plan(profile?: { cuotasTotales?: number; plan?: string } | null) {
  if (!profile) return false;
  if (Number(profile.cuotasTotales ?? 0) >= GROUP_CAPACITY_83) return true;
  return (profile.plan ?? "").toLowerCase().includes("83") || (profile.plan ?? "").toLowerCase().includes("ciclon");
}

export default function GroupSheetClient({ initialGroup, initialPlanType }: GroupSheetClientProps) {
  const [group, setGroup] = useState(initialGroup);
  const [planType, setPlanType] = useState<"26" | "83">(initialPlanType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<CuotaMonitorClient[]>([]);
  const [profiles, setProfiles] = useState<Record<string, CuotaMonitorProfile>>({});
  const [installments, setInstallments] = useState<CuotaMonitorInstallment[]>([]);
  const [participantEdits, setParticipantEdits] = useState<Record<string, { nombre: string; cedula: string; telefono: string; monto: string }>>({});
  const [submittingQuotaKey, setSubmittingQuotaKey] = useState("");
  const groupCapacity = planType === "83" ? GROUP_CAPACITY_83 : GROUP_CAPACITY_26;

  async function loadOverview(showLoader = true) {
    if (showLoader) {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/monitor-cuotas`, { cache: "no-store" });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        clients?: CuotaMonitorClient[];
        profiles?: Record<string, CuotaMonitorProfile>;
        installments?: CuotaMonitorInstallment[];
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "No se pudo cargar la hoja operativa del grupo.");
      }

      setClients(data.clients ?? []);
      setProfiles(data.profiles ?? {});
      setInstallments(data.installments ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar la hoja operativa.";
      setError(message);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadOverview();

    const intervalId = window.setInterval(() => {
      void loadOverview(false);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setPlanType(initialPlanType);
  }, [initialPlanType]);

  const groupParticipants = useMemo(() => {
    return clients
      .filter((item) => item.agencia?.trim() === group)
      .filter((item) => {
        const profile = profiles[item.id];
        const profilePlanType: "26" | "83" = isCiclon83Plan(profile) ? "83" : "26";
        return profilePlanType === planType;
      })
      .map((item) => {
        const profile = profiles[item.id];
        const edit = participantEdits[item.id];
        const paidInstallments = new Set(
          installments
            .filter((installment) => installment.clientId === item.id && installment.estado === "Pagada")
            .map((installment) => installment.numero)
        );

        const paidByDefault: Record<number, boolean> = {};
        for (let cuota = 1; cuota <= groupCapacity; cuota += 1) {
          paidByDefault[cuota] = paidInstallments.has(cuota);
        }

        return {
          ...item,
          nombreEditable: edit?.nombre ?? profile?.apellido ?? item.nombre.split(/\s+/).slice(-2).join(" "),
          cedulaEditable: edit?.cedula ?? item.documento,
          telefonoEditable: edit?.telefono ?? item.telefono,
          montoEditable: edit?.monto ?? String(profile?.cuotaMensual ?? 0),
          paidByDefault,
        };
      });
  }, [clients, group, participantEdits, profiles, installments, planType, groupCapacity]);

  async function handleMarkInstallmentPaid(clientId: string, cuota: number, isPaid: boolean) {
    const actionLabel = isPaid ? "desmarcar" : "marcar";
    const shouldContinue = window.confirm(`¿Confirmas ${actionLabel} la cuota #${cuota} ${isPaid ? "como pagada" : "como pagada"}?`);
    if (!shouldContinue) {
      return;
    }

    const profile = profiles[clientId];
    const participant = clients.find((item) => item.id === clientId);
    if (!profile || !participant) {
      setError("No se encontró el expediente del participante para registrar el pago.");
      return;
    }

    const cedula = (profile.cedula || participant.documento || "").replace(/\D/g, "");
    if (!cedula) {
      setError("No se pudo determinar la cédula del participante.");
      return;
    }

    const installmentData = installments.find((item) => item.clientId === clientId && item.numero === cuota);
    const montoBase = Number(installmentData?.monto ?? Number(participantEdits[clientId]?.monto ?? profile.cuotaMensual ?? 0));
    const recargo = Number(installmentData?.recargo ?? 0);
    const amount = Number((montoBase + recargo).toFixed(2));
    const quotaKey = `${clientId}-${cuota}`;

    if (amount <= 0) {
      setError(`No se pudo calcular el monto de la cuota #${cuota}.`);
      return;
    }

    setSubmittingQuotaKey(quotaKey);
    setError("");

    try {
      const response = isPaid
        ? await fetch(`${API_BASE}/api/monitor-cuotas?cedula=${cedula}&installmentNumber=${cuota}`, {
            method: "DELETE",
          })
        : await fetch(`${API_BASE}/api/monitor-cuotas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "installment",
              cedula,
              installmentNumber: cuota,
              amount,
              paymentDate: new Date().toISOString().slice(0, 10),
              reference: `GS-${cuota}-${Date.now()}`,
              bank: "Registro operativo SAN",
              method: "Transferencia",
              note: "Pago marcado desde hoja operativa de grupo.",
            }),
          });

      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setError(data.message || `No se pudo ${isPaid ? "desmarcar" : "marcar"} la cuota #${cuota}.`);
        return;
      }

      await loadOverview(false);
    } catch {
      setError("No se pudo registrar el pago de la cuota en este momento.");
    } finally {
      setSubmittingQuotaKey("");
    }
  }

  const groupBadge = useMemo(() => {
    const match = group.match(/(\d+)/);
    const number = match ? Number(match[1]) : 1;
    return `#${String(number).padStart(2, "0")} MERIDA`;
  }, [group]);

  return (
    <main className="min-h-screen bg-[#f3f4f6] px-4 py-6 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-[1900px] space-y-4">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Hoja operativa independiente</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm print:hidden"
              >
                {Array.from({ length: 100 }, (_, index) => `Grupo ${String(index + 1).padStart(2, "0")}`).map((item) => (
                  <option key={`group-sheet-select-${item}`} value={item}>{item}</option>
                ))}
              </select>
              <select
                value={planType}
                onChange={(event) => setPlanType(event.target.value === "83" ? "83" : "26")}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm print:hidden"
              >
                <option value="26">Plan 26 cuotas</option>
                <option value="83">Grupo 83 cuotas ciclón</option>
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 print:hidden"
              >
                Imprimir horizontal
              </button>
              <Link href="/admin" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 print:hidden">
                Volver al dashboard
              </Link>
            </div>
          </div>
          <div className="mt-4">
            <Image
              src="/lOGOLISTO.png"
              alt="Logo principal San Merida"
              width={1800}
              height={120}
              className="h-[68px] w-full object-contain"
              priority
            />
          </div>
          <div className="mt-3 text-center">
            <h1 className="text-xl font-semibold text-zinc-900">Registro completo de participantes {groupBadge} · {planType === "83" ? "83 cuotas" : "26 cuotas"}</h1>
          </div>
        </header>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
            Participantes: <span className="font-semibold text-zinc-900">{groupParticipants.length}</span> · Cupos máximos: <span className="font-semibold text-zinc-900">{groupCapacity}</span> · Disponibles: <span className="font-semibold text-emerald-700">{Math.max(0, groupCapacity - groupParticipants.length)}</span>
          </div>

          <div className="overflow-x-auto p-3 print:overflow-visible print:p-0">
            <table className={`w-full border-collapse text-[10px] print:min-w-0 print:w-full ${planType === "83" ? "min-w-[2400px]" : "min-w-[1120px]"}`}>
              <thead>
                <tr className="bg-zinc-900 text-white">
                  <th className="w-[120px] border border-zinc-700 px-1 py-1 text-left">Apellidos</th>
                  <th className="w-[95px] border border-zinc-700 px-1 py-1 text-left">Cédula</th>
                  <th className="w-[95px] border border-zinc-700 px-1 py-1 text-left">Teléfono</th>
                  <th className="w-[56px] border border-zinc-700 px-1 py-1 text-left">Monto</th>
                  {Array.from({ length: groupCapacity }, (_, index) => index + 1).map((cuota) => (
                    <th key={`group-sheet-header-${cuota}`} className="border border-zinc-700 px-0 py-0.5 text-center text-[9px]">{cuota}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4 + groupCapacity} className="border border-zinc-200 px-3 py-5 text-center text-zinc-500">Cargando grupo...</td>
                  </tr>
                ) : groupParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={4 + groupCapacity} className="border border-zinc-200 px-3 py-5 text-center text-zinc-500">No hay participantes activos en este grupo para el plan seleccionado.</td>
                  </tr>
                ) : (
                  groupParticipants.map((participant) => (
                    <tr key={`${group}-${participant.id}-row`} className="odd:bg-white even:bg-zinc-50/60">
                      <td className="border border-zinc-200 px-1 py-0.5">
                        <input
                          value={participant.nombreEditable}
                          onChange={(event) => {
                            const value = event.target.value;
                            setParticipantEdits((current) => ({
                              ...current,
                              [participant.id]: {
                                nombre: value,
                                cedula: current[participant.id]?.cedula ?? participant.cedulaEditable,
                                telefono: current[participant.id]?.telefono ?? participant.telefonoEditable,
                                monto: current[participant.id]?.monto ?? participant.montoEditable,
                              },
                            }));
                          }}
                          className="w-[120px] rounded-sm border border-zinc-200 bg-white px-1 py-0.5 text-[10px]"
                        />
                      </td>
                      <td className="border border-zinc-200 px-1 py-0.5">
                        <input
                          value={participant.cedulaEditable}
                          onChange={(event) => {
                            const value = event.target.value;
                            setParticipantEdits((current) => ({
                              ...current,
                              [participant.id]: {
                                nombre: current[participant.id]?.nombre ?? participant.nombreEditable,
                                cedula: value,
                                telefono: current[participant.id]?.telefono ?? participant.telefonoEditable,
                                monto: current[participant.id]?.monto ?? participant.montoEditable,
                              },
                            }));
                          }}
                          className="w-[95px] rounded-sm border border-zinc-200 bg-white px-1 py-0.5 text-[10px]"
                        />
                      </td>
                      <td className="border border-zinc-200 px-1 py-0.5">
                        <input
                          value={participant.telefonoEditable}
                          onChange={(event) => {
                            const value = event.target.value;
                            setParticipantEdits((current) => ({
                              ...current,
                              [participant.id]: {
                                nombre: current[participant.id]?.nombre ?? participant.nombreEditable,
                                cedula: current[participant.id]?.cedula ?? participant.cedulaEditable,
                                telefono: value,
                                monto: current[participant.id]?.monto ?? participant.montoEditable,
                              },
                            }));
                          }}
                          className="w-[95px] rounded-sm border border-zinc-200 bg-white px-1 py-0.5 text-[10px]"
                        />
                      </td>
                      <td className="border border-zinc-200 px-1 py-0.5">
                        <input
                          value={participant.montoEditable}
                          onChange={(event) => {
                            const value = event.target.value;
                            setParticipantEdits((current) => ({
                              ...current,
                              [participant.id]: {
                                nombre: current[participant.id]?.nombre ?? participant.nombreEditable,
                                cedula: current[participant.id]?.cedula ?? participant.cedulaEditable,
                                telefono: current[participant.id]?.telefono ?? participant.telefonoEditable,
                                monto: value,
                              },
                            }));
                          }}
                          className="w-[56px] rounded-sm border border-zinc-200 bg-white px-1 py-0.5 text-[10px]"
                        />
                      </td>
                      {Array.from({ length: groupCapacity }, (_, index) => index + 1).map((cuota) => {
                        const isPaid = participant.paidByDefault[cuota] === true;
                        const quotaKey = `${participant.id}-${cuota}`;
                        const quotaLoading = submittingQuotaKey === quotaKey;

                        return (
                          <td key={`${participant.id}-quota-${cuota}`} className="border border-zinc-200 px-0.5 py-0.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                void handleMarkInstallmentPaid(participant.id, cuota, isPaid);
                              }}
                              disabled={quotaLoading || loading}
                              className={`mx-auto inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] text-[9px] disabled:cursor-not-allowed disabled:opacity-70 ${isPaid ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500"}`}
                              title={
                                isPaid
                                  ? `Cuota #${cuota} pagada (clic para desmarcar)`
                                  : quotaLoading
                                    ? `Registrando cuota #${cuota}...`
                                    : `Marcar cuota #${cuota} como pagada`
                              }
                            >
                              {quotaLoading ? "…" : isPaid ? "✓" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <style jsx global>{`
        @media print {
          @page {
            size: legal landscape;
            margin: 8mm;
          }

          body {
            background: #fff !important;
          }

          table {
            width: 100% !important;
            border-color: #000 !important;
          }

          thead tr {
            background: #18181b !important;
          }

          thead th {
            background: #18181b !important;
            color: #fff !important;
            border-color: #000 !important;
          }

          td,
          th {
            border-color: #000 !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </main>
  );
}
