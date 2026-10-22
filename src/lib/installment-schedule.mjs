/**
 * Logica pura del calendario de cuotas de un expediente.
 *
 * Se usa desde dos lugares para que las cifras coincidan siempre:
 *  - el monitor de cuotas del panel administrativo (`/api/monitor-cuotas`);
 *  - el panel del miembro (`/api/member-panel`), donde el propio cliente ve sus
 *    cuotas, su saldo y sus pagos.
 *
 * Reglas de negocio:
 *  - Plan de 26 cuotas  => una cuota cada 15 dias (quincenal).
 *  - Plan de 83 cuotas  => una cuota cada 7 dias (semanal).
 *  - Financiamiento 50% => una cuota cada 15 dias (quincenal).
 *  - Una cuota es "Pagada" solo cuando los pagos cubren el monto completo
 *    (se admiten abonos parciales por cuota).
 *  - "Vencida" cuando pasa mas de 30 dias del vencimiento; "Por vencer" entre 20
 *    y 30 dias; el recargo por mora es del 8% del monto de la cuota.
 */

/** Redondea a dos decimales evitando los errores de coma flotante. */
export function normalizeMoney(value) {
  return Number(Number(value).toFixed(2));
}

/** Fecha valida o "ahora" si viene vacia/invalida. */
export function parseIsoOrNow(value) {
  if (!value) return new Date();

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Suma dias a una fecha (no muta la original). */
export function addDays(base, days) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);

  return next;
}

/** Formatea fecha como dd/mm/aaaa (o "—"). */
export function toDmy(value) {
  if (!value) return "—";

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Numero total de cuotas del plan contratado.
 * El plan de financiamiento guarda su numero exacto en `installmentCount`.
 */
export function resolveInstallmentTotal(planName, termMonths, installmentCount) {
  if (installmentCount && installmentCount > 0) {
    return installmentCount;
  }

  const normalizedPlan = String(planName ?? "").toLowerCase();

  if (normalizedPlan.includes("83")) {
    return 83;
  }

  if (normalizedPlan.includes("26")) {
    return 26;
  }

  return Math.max(termMonths ?? 26, 1);
}

/**
 * Dias entre cuotas segun el plan:
 *  - 83 cuotas o plan "Ciclon"   => 7 dias (semanal)
 *  - financiamiento o 26 cuotas  => 15 dias (quincenal)
 */
export function resolveIntervalDays(planName, total) {
  const normalizedPlan = String(planName ?? "").toLowerCase();

  if (normalizedPlan.includes("financ")) {
    return 15;
  }

  if (total >= 83 || normalizedPlan.includes("83") || normalizedPlan.includes("cicl")) {
    return 7;
  }

  return 15;
}

/** Suma los pagos por numero de cuota (admite pagos parciales). */
export function buildPaidAmountMap(payments) {
  const map = new Map();

  for (const payment of payments) {
    map.set(
      payment.installmentNumber,
      normalizeMoney((map.get(payment.installmentNumber) ?? 0) + payment.amount),
    );
  }

  return map;
}


/**
 * Construye el calendario completo de cuotas de un expediente.
 *
 * @param {{
 *   clientId: string,
 *   cuotaMensual: number,
 *   total: number,
 *   startDate: Date,
 *   intervalDays: number,
 *   paidAmountByNumber: Map<number, number>,
 *   now?: Date,
 * }} params
 */
export function buildInstallments(params) {
  const now = params.now ?? new Date();
  const nowTs = now.getTime();

  return Array.from({ length: params.total }, (_, index) => {
    const numero = index + 1;
    const dueDate = addDays(params.startDate, index * params.intervalDays);
    const dueTs = dueDate.getTime();
    const paidAmount = params.paidAmountByNumber.get(numero) ?? 0;
    // Solo es "Pagada" cuando el monto cubre la cuota completa (soporta pagos parciales).
    const isPaid = paidAmount + 0.01 >= params.cuotaMensual;

    let estado = "Pendiente";

    const lateDays = (nowTs - dueTs) / (1000 * 60 * 60 * 24);

    if (isPaid) {
      estado = "Pagada";
    } else if (lateDays > 30) {
      estado = "Vencida";
    } else if (lateDays > 20) {
      estado = "Por vencer";
    }

    const recargo = estado === "Vencida" ? Number((params.cuotaMensual * 0.08).toFixed(2)) : 0;

    return {
      id: `${params.clientId}-cuota-${numero}`,
      clientId: params.clientId,
      semana: numero,
      numero,
      tipo: estado === "Vencida" ? "Fuera de semana" : "Regular",
      vence: toDmy(dueDate),
      venceIso: dueDate.toISOString(),
      monto: params.cuotaMensual,
      abonado: normalizeMoney(paidAmount),
      recargo,
      estado,
    };
  });
}


/**
 * Resumen del plan para mostrar en el panel del miembro.
 *
 * @param {Array<{ numero: number, monto: number, recargo: number, estado: string, vence: string, venceIso: string, abonado: number }>} installments
 * @param {{ abonos?: number, cuotaMensual?: number }} [options]
 */
export function summarizeInstallments(installments, options = {}) {
  const cuotaMensual = options.cuotaMensual ?? 0;
  const abonos = normalizeMoney(options.abonos ?? 0);

  const pagadas = installments.filter((item) => item.estado === "Pagada");
  const vencidas = installments.filter((item) => item.estado === "Vencida");
  const porVencer = installments.filter((item) => item.estado === "Por vencer");
  const pendientes = installments.filter((item) => item.estado !== "Pagada");

  const totalPlan = normalizeMoney(
    installments.reduce((acc, item) => acc + item.monto + item.recargo, 0),
  );

  const totalPagadoCuotas = normalizeMoney(
    installments.reduce((acc, item) => acc + (item.estado === "Pagada" ? item.monto : item.abonado), 0),
  );

  const saldo = Math.max(0, normalizeMoney(totalPlan - totalPagadoCuotas - abonos));
  const proxima = pendientes[0] ?? null;

  return {
    totalCuotas: installments.length,
    cuotasPagadas: pagadas.length,
    cuotasPendientes: pendientes.length,
    cuotasVencidas: vencidas.length,
    cuotasPorVencer: porVencer.length,
    totalPlan,
    totalPagadoCuotas,
    totalAbonos: abonos,
    montoPagado: normalizeMoney(totalPagadoCuotas + abonos),
    saldo,
    avance: installments.length > 0 ? Math.round((pagadas.length / installments.length) * 100) : 0,
    cuotaMensual: normalizeMoney(cuotaMensual),
    proximaCuota: proxima
      ? {
          numero: proxima.numero,
          vence: proxima.vence,
          monto: normalizeMoney(proxima.monto),
          recargo: proxima.recargo,
        }
      : null,
  };
}
