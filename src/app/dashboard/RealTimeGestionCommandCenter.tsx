"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
	Activity,
	Bell,
	BriefcaseBusiness,
	CheckCircle2,
	Landmark,
	Radio,
	ShieldCheck,
	Timer,
	TrendingUp,
	Users,
	X,
} from "lucide-react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

type AreaBoard = {
	id: string;
	area: string;
	owner: string;
	backlog: number;
	sla: number;
	budget: number;
	status: "Controlado" | "Seguimiento" | "Critico";
	note: string;
};

type Initiative = {
	id: string;
	title: string;
	owner: string;
	progress: number;
	due: string;
	status: "On track" | "Attention" | "Critical";
};

type CommitteeItem = {
	id: string;
	title: string;
	area: string;
	level: "Alta" | "Media" | "Inmediata";
};

type TrendPoint = {
	label: string;
	backlog: number;
	sla: number;
	ejecucion: number;
};

const baseAreaBoard: AreaBoard[] = [
	{
		id: "ops",
		area: "Operaciones administrativas",
		owner: "Luisa Salcedo",
		backlog: 28,
		sla: 94,
		budget: 72,
		status: "Controlado",
		note: "Cierre de incidencias y soporte de sedes en linea con el plan semanal.",
	},
	{
		id: "compras",
		area: "Compras y abastecimiento",
		owner: "Miguel Duarte",
		backlog: 18,
		sla: 91,
		budget: 67,
		status: "Seguimiento",
		note: "Ordenes criticas en ruta de aprobacion con foco en continuidad de inventario.",
	},
	{
		id: "talento",
		area: "Talento y servicio interno",
		owner: "Valentina Rojas",
		backlog: 12,
		sla: 96,
		budget: 58,
		status: "Controlado",
		note: "Cobertura de posiciones operativas clave y clima interno estables.",
	},
	{
		id: "infra",
		area: "Infraestructura y servicios",
		owner: "Pedro Vera",
		backlog: 25,
		sla: 88,
		budget: 81,
		status: "Critico",
		note: "Mantenimiento correctivo de sedes con presion por tickets acumulados.",
	},
];

const baseInitiatives: Initiative[] = [
	{
		id: "ini-1",
		title: "Racionalizacion del flujo de aprobaciones",
		owner: "Direccion administrativa",
		progress: 74,
		due: "15/03/2026",
		status: "On track",
	},
	{
		id: "ini-2",
		title: "Automatizacion de reposicion critica",
		owner: "Compras",
		progress: 56,
		due: "22/03/2026",
		status: "Attention",
	},
	{
		id: "ini-3",
		title: "Refuerzo de continuidad operativa",
		owner: "Infraestructura",
		progress: 39,
		due: "29/03/2026",
		status: "Critical",
	},
];

const baseCommitteeQueue: CommitteeItem[] = [
	{ id: "com-1", title: "Aprobacion de compras prioritarias", area: "Compras", level: "Inmediata" },
	{ id: "com-2", title: "Refuerzo temporal de mantenimiento", area: "Infraestructura", level: "Alta" },
	{ id: "com-3", title: "Ajuste de presupuesto operativo", area: "Administracion", level: "Media" },
];

const baseAlerts = [
	"El backlog de infraestructura se mantiene por encima del umbral esperado.",
	"Compras conserva 4 solicitudes de aprobacion con impacto operativo.",
	"El cierre administrativo semanal mantiene cumplimiento global estable.",
	"Talento sostiene cobertura activa en posiciones criticas de soporte.",
];

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function updateArea(area: AreaBoard): AreaBoard {
	const backlog = clamp(area.backlog + (Math.floor(Math.random() * 5) - 2), 8, 40);
	const sla = clamp(area.sla + (Math.floor(Math.random() * 3) - 1), 82, 98);
	const budget = clamp(area.budget + (Math.floor(Math.random() * 5) - 2), 48, 92);
	const status = sla < 90 || backlog > 26 ? "Critico" : sla < 93 || backlog > 18 ? "Seguimiento" : "Controlado";

	return {
		...area,
		backlog,
		sla,
		budget,
		status,
	};
}

function updateInitiative(item: Initiative): Initiative {
	const progress = clamp(item.progress + (Math.floor(Math.random() * 5) - 1), 24, 99);
	const status = progress >= 70 ? "On track" : progress >= 50 ? "Attention" : "Critical";

	return {
		...item,
		progress,
		status,
	};
}

export default function RealTimeGestionCommandCenter() {
	const INDUSTRIAL_ENCRYPTED_KEY = "f9d7ea4783a4539319a2f64f9021bf128a54e505f04c63bf331619684547ebe8";

	const router = useRouter();
	const [areaBoard, setAreaBoard] = useState(baseAreaBoard);
	const [initiatives, setInitiatives] = useState(baseInitiatives);
	const [committeeQueue, setCommitteeQueue] = useState(baseCommitteeQueue);
	const [alerts, setAlerts] = useState(baseAlerts);
	const [liveClock, setLiveClock] = useState("--:--:--");
	const [cycle, setCycle] = useState(0);
	const [showIndustrialOverlay, setShowIndustrialOverlay] = useState(false);
	const [encryptedKey, setEncryptedKey] = useState("");
	const [accessError, setAccessError] = useState("");
	const [trendData, setTrendData] = useState<TrendPoint[]>([
		{ label: "08:00", backlog: 94, sla: 91, ejecucion: 68 },
		{ label: "09:00", backlog: 89, sla: 92, ejecucion: 70 },
		{ label: "10:00", backlog: 86, sla: 93, ejecucion: 73 },
		{ label: "11:00", backlog: 81, sla: 94, ejecucion: 75 },
		{ label: "12:00", backlog: 79, sla: 94, ejecucion: 77 },
		{ label: "13:00", backlog: 76, sla: 95, ejecucion: 79 },
	]);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setAreaBoard((current) => current.map(updateArea));
			setInitiatives((current) => current.map(updateInitiative));
			setAlerts((current) => [...current.slice(1), current[0]]);
			setCommitteeQueue((current) => [...current.slice(1), current[0]]);
			setTrendData((current) => {
				const nextHour = 8 + current.length;
				const nextLabel = `${String(nextHour > 23 ? nextHour - 24 : nextHour).padStart(2, "0")}:00`;
				const last = current[current.length - 1] ?? { label: "07:00", backlog: 96, sla: 90, ejecucion: 66 };
				const nextPoint = {
					label: nextLabel,
					backlog: clamp(last.backlog + (Math.floor(Math.random() * 7) - 4), 58, 110),
					sla: clamp(last.sla + (Math.floor(Math.random() * 3) - 1), 86, 98),
					ejecucion: clamp(last.ejecucion + (Math.floor(Math.random() * 5) - 1), 60, 96),
				};

				return [...current.slice(1), nextPoint];
			});
			setLiveClock(new Date().toLocaleTimeString("es-VE"));
			setCycle((current) => current + 1);
		}, 3000);

		return () => window.clearInterval(intervalId);
	}, []);

	const summary = useMemo(() => {
		const backlog = areaBoard.reduce((acc, item) => acc + item.backlog, 0);
		const avgSla = Math.round(areaBoard.reduce((acc, item) => acc + item.sla, 0) / Math.max(areaBoard.length, 1));
		const avgBudget = Math.round(areaBoard.reduce((acc, item) => acc + item.budget, 0) / Math.max(areaBoard.length, 1));
		const criticalAreas = areaBoard.filter((item) => item.status === "Critico").length;
		const initiativeCompletion = Math.round(
			initiatives.reduce((acc, item) => acc + item.progress, 0) / Math.max(initiatives.length, 1)
		);

		return {
			backlog,
			avgSla,
			avgBudget,
			criticalAreas,
			initiativeCompletion,
			continuity: clamp(avgSla - criticalAreas * 2 + 4, 74, 99),
		};
	}, [areaBoard, initiatives]);

	function openIndustrialOverlay() {
		setEncryptedKey("");
		setAccessError("");
		setShowIndustrialOverlay(true);
	}

	function closeIndustrialOverlay() {
		setShowIndustrialOverlay(false);
		setEncryptedKey("");
		setAccessError("");
	}

	function handleIndustrialAccess() {
		if (encryptedKey.trim() !== INDUSTRIAL_ENCRYPTED_KEY) {
			setAccessError("Clave incriptada invalida. Verifica e intenta nuevamente.");
			return;
		}

		router.push("/admin/industrial");
	}

	return (
		<>
		<section className="space-y-5 rounded-[34px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.10),_transparent_33%),linear-gradient(145deg,#fbfdff_0%,#f4f7fb_52%,#eef2f8_100%)] p-5 shadow-[0_28px_74px_-48px_rgba(15,23,42,0.32)] md:p-6">
			<article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white/90 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="max-w-3xl">
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
							Direccion administrativa y operativa
						</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
							Centro de gestion empresarial independiente
						</h2>
						<p className="mt-3 text-sm leading-7 text-slate-600">
							Vista directiva para controlar backoffice, abastecimiento, talento, infraestructura,
							cumplimiento y agenda de comite, con lectura integrada del ritmo operativo y financiero.
						</p>
					</div>

					<div className="space-y-3">
						<div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
							<Radio className="h-3.5 w-3.5" />
							Live {liveClock}
						</div>
						<button
							type="button"
							onClick={openIndustrialOverlay}
							className="w-full rounded-2xl border border-slate-900 bg-slate-950 px-4 py-3 text-left text-sm text-white transition hover:bg-slate-900"
						>
							<p className="text-xs uppercase tracking-[0.16em] text-slate-400">Nueva opcion</p>
							<p className="mt-1 font-semibold">Gestion Industrial</p>
							<p className="mt-1 text-xs text-slate-400">Abrir dashboard industrial completo</p>
						</button>
						<div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-sm text-slate-100">
							<p className="text-xs uppercase tracking-[0.16em] text-slate-400">Corte ejecutivo</p>
							<p className="mt-1 font-medium">Ciclo operativo #{String(cycle).padStart(3, "0")}</p>
						</div>
					</div>
				</div>

				<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">SLA consolidado</p>
						<p className="mt-2 text-3xl font-semibold text-slate-950">{summary.avgSla}%</p>
						<p className="mt-2 text-xs text-slate-500">Nivel de servicio agregado del soporte administrativo.</p>
					</article>
					<article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Backlog vivo</p>
						<p className="mt-2 text-3xl font-semibold text-amber-600">{summary.backlog}</p>
						<p className="mt-2 text-xs text-slate-500">Pendientes activos con seguimiento diario.</p>
					</article>
					<article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Uso presupuestario</p>
						<p className="mt-2 text-3xl font-semibold text-emerald-700">{summary.avgBudget}%</p>
						<p className="mt-2 text-xs text-slate-500">Ejecucion media del mes sobre plan operativo.</p>
					</article>
					<article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Continuidad</p>
						<p className="mt-2 text-3xl font-semibold text-sky-700">{summary.continuity}%</p>
						<p className="mt-2 text-xs text-slate-500">Indicador global de estabilidad operativa.</p>
					</article>
				</div>
			</article>

			<div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
				<article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
					<header className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-5 w-5 text-slate-700" />
							<div>
								<h3 className="font-semibold text-slate-950">Pulso administrativo y operativo</h3>
								<p className="text-sm text-slate-500">Evolucion del backlog, SLA y ejecucion del dia.</p>
							</div>
						</div>
						<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Ultimos 6 cortes</span>
					</header>

					<div className="h-[320px] rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={trendData}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
								<XAxis dataKey="label" axisLine={false} tickLine={false} stroke="#64748b" />
								<YAxis axisLine={false} tickLine={false} stroke="#64748b" />
								<Tooltip
									contentStyle={{
										backgroundColor: "#ffffff",
										borderRadius: "16px",
										border: "1px solid #e2e8f0",
										color: "#0f172a",
									}}
								/>
								<Line type="monotone" dataKey="backlog" stroke="#0f172a" strokeWidth={3} dot={{ r: 4 }} name="Backlog" />
								<Line type="monotone" dataKey="sla" stroke="#0284c7" strokeWidth={3} dot={{ r: 4 }} name="SLA" />
								<Line type="monotone" dataKey="ejecucion" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} name="Ejecucion" />
							</LineChart>
						</ResponsiveContainer>
					</div>

					<div className="mt-4 grid gap-3 md:grid-cols-3">
						{[
							{ label: "Backlog actual", value: trendData[trendData.length - 1]?.backlog ?? 0, tone: "text-slate-950" },
							{ label: "SLA actual", value: `${trendData[trendData.length - 1]?.sla ?? 0}%`, tone: "text-sky-700" },
							{ label: "Ejecucion", value: `${trendData[trendData.length - 1]?.ejecucion ?? 0}%`, tone: "text-emerald-700" },
						].map((item) => (
							<div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
								<p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
							</div>
						))}
					</div>
				</article>

				<article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
					<header className="mb-4 flex items-center gap-2">
						<Activity className="h-5 w-5 text-slate-700" />
						<div>
							<h3 className="font-semibold text-slate-950">Lectura ejecutiva</h3>
							<p className="text-sm text-slate-500">Interpretacion consolidada del comportamiento operativo.</p>
						</div>
					</header>

					<div className="space-y-3">
						<div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Foco operativo</p>
							<p className="mt-2 text-lg font-semibold text-slate-950">Infraestructura requiere contencion</p>
							<p className="mt-2 text-sm leading-6 text-slate-600">La curva de backlog sigue alta en servicios e infraestructura; el objetivo inmediato es descargar tickets criticos en la proxima ventana de comite.</p>
						</div>
						<div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Foco financiero</p>
							<p className="mt-2 text-lg font-semibold text-slate-950">Ejecucion controlada</p>
							<p className="mt-2 text-sm leading-6 text-slate-600">La disciplina presupuestaria se mantiene estable y acompana el ritmo de las operaciones sin desviaciones severas.</p>
						</div>
						<div className="rounded-[22px] border border-slate-200 bg-slate-950 p-4 text-slate-100">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Directriz</p>
							<p className="mt-2 text-sm leading-6">Priorizar aprobaciones bloqueadas, acelerar mantenimiento correctivo y sostener el SLA corporativo por encima de 93%.</p>
						</div>
					</div>
				</article>
			</div>

			<div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
				<article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
					<header className="mb-4 flex items-center gap-2">
						<BriefcaseBusiness className="h-5 w-5 text-slate-700" />
						<div>
							<h3 className="font-semibold text-slate-950">Mesa operativa por frente</h3>
							<p className="text-sm text-slate-500">Responsables, carga, servicio y disciplina de ejecucion por area.</p>
						</div>
					</header>

					<div className="space-y-3">
						{areaBoard.map((item) => (
							<article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-slate-950">{item.area}</p>
										<p className="text-xs text-slate-500">Responsable: {item.owner}</p>
									</div>
									<span
										className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
											item.status === "Controlado"
												? "bg-emerald-100 text-emerald-700"
												: item.status === "Seguimiento"
													? "bg-amber-100 text-amber-700"
													: "bg-rose-100 text-rose-700"
										}`}
									>
										{item.status}
									</span>
								</div>

								<p className="mt-3 text-sm leading-6 text-slate-700">{item.note}</p>

								<div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs text-slate-500">
									<p>Backlog: <span className="font-semibold text-slate-900">{item.backlog}</span></p>
									<p>SLA: <span className="font-semibold text-slate-900">{item.sla}%</span></p>
									<p>Budget: <span className="font-semibold text-slate-900">{item.budget}%</span></p>
								</div>

								<div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
									<div
										className={`h-full rounded-full ${
											item.status === "Controlado"
												? "bg-emerald-500"
												: item.status === "Seguimiento"
													? "bg-amber-500"
													: "bg-rose-500"
										}`}
										style={{ width: `${item.sla}%` }}
									/>
								</div>
							</article>
						))}
					</div>
				</article>

				<div className="space-y-4">
					<article className="rounded-[30px] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_18px_48px_-42px_rgba(15,23,42,0.55)]">
						<header className="flex items-center gap-2">
							<Landmark className="h-5 w-5 text-sky-300" />
							<div>
								<h3 className="font-semibold">War room ejecutivo</h3>
								<p className="text-sm text-slate-400">Lectura de decisiones, continuidad y presion administrativa.</p>
							</div>
						</header>

						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
								<p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Frentes criticos</p>
								<p className="mt-2 text-3xl font-semibold">{summary.criticalAreas}</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
								<p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Iniciativas activas</p>
								<p className="mt-2 text-3xl font-semibold">{initiatives.length}</p>
							</div>
						</div>

						<div className="mt-4 space-y-3">
							{committeeQueue.map((item) => (
								<div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-slate-100">{item.title}</p>
											<p className="text-xs text-slate-400">{item.area}</p>
										</div>
										<span
											className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
												item.level === "Inmediata"
													? "bg-rose-500/20 text-rose-200"
													: item.level === "Alta"
														? "bg-amber-500/20 text-amber-200"
														: "bg-sky-500/20 text-sky-200"
											}`}
										>
											{item.level}
										</span>
									</div>
								</div>
							))}
						</div>
					</article>

					<article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
						<header className="flex items-center gap-2">
							<Bell className="h-5 w-5 text-slate-700" />
							<div>
								<h3 className="font-semibold text-slate-950">Alertas gerenciales</h3>
								<p className="text-sm text-slate-500">Novedades de operacion, presupuesto y servicio.</p>
							</div>
						</header>
						<div className="mt-4 space-y-2">
							{alerts.slice(0, 3).map((alert, index) => (
								<p key={`${alert}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
									{alert}
								</p>
							))}
						</div>
					</article>
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
				<article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
					<header className="mb-4 flex items-center gap-2">
						<ShieldCheck className="h-5 w-5 text-emerald-600" />
						<div>
							<h3 className="font-semibold text-slate-950">Gobernanza y control interno</h3>
							<p className="text-sm text-slate-500">Cumplimiento, conciliaciones y madurez de control.</p>
						</div>
					</header>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Conciliaciones al dia</p>
							<p className="mt-2 text-2xl font-semibold text-emerald-700">96%</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hallazgos activos</p>
							<p className="mt-2 text-2xl font-semibold text-rose-600">{summary.criticalAreas + 2}</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Riesgo residual</p>
							<p className="mt-2 text-2xl font-semibold text-amber-600">Moderado</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Proxima revision</p>
							<p className="mt-2 text-2xl font-semibold text-slate-950">72 h</p>
						</div>
					</div>

					<div className="mt-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-sm text-slate-100">
						<p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" />Control interno estable con foco sobre infraestructura y aprobaciones urgentes.</p>
					</div>
				</article>

				<article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
					<header className="mb-4 flex items-center gap-2">
						<Users className="h-5 w-5 text-slate-700" />
						<div>
							<h3 className="font-semibold text-slate-950">Iniciativas estrategicas 90 dias</h3>
							<p className="text-sm text-slate-500">Transformacion operativa, ahorro y continuidad.</p>
						</div>
					</header>

					<div className="space-y-3">
						{initiatives.map((item) => (
							<article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-slate-950">{item.title}</p>
										<p className="text-xs text-slate-500">Owner: {item.owner} · Corte: {item.due}</p>
									</div>
									<span
										className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
											item.status === "On track"
												? "bg-emerald-100 text-emerald-700"
												: item.status === "Attention"
													? "bg-amber-100 text-amber-700"
													: "bg-rose-100 text-rose-700"
										}`}
									>
										{item.status}
									</span>
								</div>

								<div className="mt-3 flex items-center justify-between text-xs text-slate-500">
									<span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />Avance</span>
									<span className="font-semibold text-slate-700">{item.progress}%</span>
								</div>

								<div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
									<div
										className={`h-full rounded-full ${
											item.status === "On track"
												? "bg-emerald-500"
												: item.status === "Attention"
													? "bg-amber-500"
													: "bg-rose-500"
										}`}
										style={{ width: `${item.progress}%` }}
									/>
								</div>
							</article>
						))}
					</div>

					<div className="mt-4 grid gap-3 md:grid-cols-3">
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-[0.16em] text-slate-500">Avance medio</p>
							<p className="mt-2 text-2xl font-semibold text-slate-950">{summary.initiativeCompletion}%</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-[0.16em] text-slate-500">Productividad</p>
							<p className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold text-emerald-700"><TrendingUp className="h-5 w-5" />+6.4%</p>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-[0.16em] text-slate-500">Resolucion diaria</p>
							<p className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold text-sky-700"><Activity className="h-5 w-5" />43 casos</p>
						</div>
					</div>
				</article>
			</div>
		</section>

		{showIndustrialOverlay ? (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
				<div className="w-full max-w-xl rounded-[28px] border border-white/15 bg-white/10 p-6 text-white shadow-[0_30px_120px_-40px_rgba(15,23,42,0.65)] backdrop-blur-xl">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Gestion Industrial</p>
							<h3 className="mt-2 text-2xl font-semibold">Hola @alexis</h3>
							<p className="mt-3 text-sm leading-6 text-slate-200">
								Antes de abrir el dashboard industrial, ingresa la clave incriptada de acceso institucional.
							</p>
						</div>
						<button
							type="button"
							onClick={closeIndustrialOverlay}
							className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/10"
						>
							<X className="h-4 w-4" />
						</button>
					</div>

					<div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
						<p className="text-xs uppercase tracking-[0.16em] text-slate-300">Acceso institucional</p>
						<p className="mt-2 text-lg font-semibold">Centro de Control Empresarial</p>
					</div>

					<div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-black/15 p-4">
						<label htmlFor="industrial-encrypted-key" className="text-xs uppercase tracking-[0.16em] text-slate-300">
							Ingresa la clave incriptada
						</label>
						<input
							id="industrial-encrypted-key"
							type="password"
							value={encryptedKey}
							onChange={(event) => {
								setEncryptedKey(event.target.value);
								if (accessError) setAccessError("");
							}}
							placeholder="Ingresa la clave cifrada de maxima seguridad"
							className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-cyan-300/70 focus:outline-none"
						/>
						{accessError ? <p className="text-xs text-rose-300">{accessError}</p> : null}
					</div>

					<div className="mt-6 flex flex-wrap justify-end gap-3">
						<button
							type="button"
							onClick={closeIndustrialOverlay}
							className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={handleIndustrialAccess}
							className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
						>
							Validar y continuar
						</button>
					</div>
				</div>
			</div>
		) : null}
		</>
	);
}
