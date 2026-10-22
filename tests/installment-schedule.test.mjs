import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstallments,
  buildPaidAmountMap,
  normalizeMoney,
  parseIsoOrNow,
  resolveInstallmentTotal,
  resolveIntervalDays,
  summarizeInstallments,
  toDmy,
} from "../src/lib/installment-schedule.mjs";

const DIA = 24 * 60 * 60 * 1000;

test("normalizeMoney redondea a dos decimales", () => {
  assert.equal(normalizeMoney(10.456), 10.46);
  assert.equal(normalizeMoney(0.1 + 0.2), 0.3);
  assert.equal(normalizeMoney(100), 100);
});

test("parseIsoOrNow acepta fechas validas y cae en ahora si vienen mal", () => {
  assert.equal(parseIsoOrNow("2026-01-01T12:00:00.000Z").toISOString(), "2026-01-01T12:00:00.000Z");
  assert.ok(parseIsoOrNow("no-es-fecha") instanceof Date);
  assert.ok(parseIsoOrNow(null) instanceof Date);
});

test("toDmy formatea como dd/mm/aaaa y tolera vacios", () => {
  assert.equal(toDmy(new Date("2026-01-01T12:00:00.000Z")), "01/01/2026");
  assert.equal(toDmy(null), "—");
  assert.equal(toDmy(""), "—");
});

test("resolveInstallmentTotal respeta el plan y el numero guardado", () => {
  assert.equal(resolveInstallmentTotal("Plan de 26 cuotas", null, null), 26);
  assert.equal(resolveInstallmentTotal("Plan de 83 cuotas", null, null), 83);
  assert.equal(resolveInstallmentTotal("Financiamiento 50% (quincenal)", 12, 18), 18);
  assert.equal(resolveInstallmentTotal(null, 12, null), 12);
});

test("resolveIntervalDays define cuotas semanales o quincenales", () => {
  assert.equal(resolveIntervalDays("Plan de 83 cuotas", 83), 7);
  assert.equal(resolveIntervalDays("Plan de 26 cuotas", 26), 15);
  assert.equal(resolveIntervalDays("Financiamiento 50% (quincenal)", 12), 15);
});

test("buildPaidAmountMap suma los pagos parciales de una misma cuota", () => {
  const map = buildPaidAmountMap([
    { installmentNumber: 1, amount: 40 },
    { installmentNumber: 1, amount: 60 },
    { installmentNumber: 3, amount: 25.5 },
  ]);

  assert.equal(map.get(1), 100);
  assert.equal(map.get(3), 25.5);
  assert.equal(map.get(2), undefined);
});

test("buildInstallments genera el calendario con fechas, estados y recargos", () => {
  const startDate = new Date("2026-01-01T12:00:00.000Z");
  const now = new Date("2026-02-23T12:00:00.000Z");

  const cuotas = buildInstallments({
    clientId: "cli-1",
    cuotaMensual: 100,
    total: 4,
    startDate,
    intervalDays: 15,
    paidAmountByNumber: new Map([[1, 100]]),
    now,
  });

  assert.equal(cuotas.length, 4);
  assert.equal(cuotas[0].estado, "Pagada");
  assert.equal(cuotas[0].vence, "01/01/2026");
  assert.equal(cuotas[1].estado, "Vencida");
  assert.equal(cuotas[1].recargo, 8);
  assert.equal(cuotas[2].estado, "Por vencer");
  assert.equal(cuotas[3].estado, "Pendiente");
  assert.equal(cuotas[3].vence, "15/02/2026");
  assert.equal(cuotas[0].id, "cli-1-cuota-1");
});

test("buildInstallments admite pagos parciales sin marcar la cuota como pagada", () => {
  const cuotas = buildInstallments({
    clientId: "cli-2",
    cuotaMensual: 100,
    total: 1,
    startDate: new Date("2026-01-01T12:00:00.000Z"),
    intervalDays: 15,
    paidAmountByNumber: new Map([[1, 40]]),
    now: new Date("2026-01-02T12:00:00.000Z"),
  });

  assert.equal(cuotas[0].estado, "Pendiente");
  assert.equal(cuotas[0].abonado, 40);
});

test("summarizeInstallments resume saldo, avance y proxima cuota", () => {
  const cuotas = buildInstallments({
    clientId: "cli-3",
    cuotaMensual: 100,
    total: 4,
    startDate: new Date("2026-01-01T12:00:00.000Z"),
    intervalDays: 15,
    paidAmountByNumber: new Map([[1, 100]]),
    now: new Date("2026-02-23T12:00:00.000Z"),
  });

  const resumen = summarizeInstallments(cuotas, { cuotaMensual: 100, abonos: 0 });

  assert.equal(resumen.totalCuotas, 4);
  assert.equal(resumen.cuotasPagadas, 1);
  assert.equal(resumen.cuotasPendientes, 3);
  assert.equal(resumen.cuotasVencidas, 1);
  assert.equal(resumen.cuotasPorVencer, 1);
  assert.equal(resumen.totalPlan, 408);
  assert.equal(resumen.totalPagadoCuotas, 100);
  assert.equal(resumen.saldo, 308);
  assert.equal(resumen.avance, 25);
  assert.equal(resumen.proximaCuota?.numero, 2);
  assert.equal(resumen.proximaCuota?.vence, "16/01/2026");
});

test("summarizeInstallments descuenta los abonos del saldo", () => {
  const cuotas = buildInstallments({
    clientId: "cli-4",
    cuotaMensual: 100,
    total: 2,
    startDate: new Date("2026-01-01T12:00:00.000Z"),
    intervalDays: 15,
    paidAmountByNumber: new Map(),
    now: new Date("2026-01-02T12:00:00.000Z"),
  });

  const resumen = summarizeInstallments(cuotas, { cuotaMensual: 100, abonos: 50 });

  assert.equal(resumen.totalPlan, 200);
  assert.equal(resumen.saldo, 150);
  assert.equal(resumen.montoPagado, 50);
  assert.equal(resumen.proximaCuota?.numero, 1);
});

test("buildInstallments sin cuotas devuelve un resumen vacio y seguro", () => {
  const cuotas = buildInstallments({
    clientId: "cli-5",
    cuotaMensual: 100,
    total: 0,
    startDate: new Date("2026-01-01T12:00:00.000Z"),
    intervalDays: 15,
    paidAmountByNumber: new Map(),
    now: new Date("2026-01-01T12:00:00.000Z"),
  });

  const resumen = summarizeInstallments(cuotas, { cuotaMensual: 100 });

  assert.equal(cuotas.length, 0);
  assert.equal(resumen.totalCuotas, 0);
  assert.equal(resumen.saldo, 0);
  assert.equal(resumen.avance, 0);
  assert.equal(resumen.proximaCuota, null);
  assert.ok(DIA > 0);
});
