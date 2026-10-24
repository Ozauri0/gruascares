// Áreas de trabajo del personal: cada una tiene su panel (/mecanico y /grua), su rol y sus textos.

export type WorkArea = "serviteca" | "grua";

export const WORK_AREAS: Record<
  WorkArea,
  {
    eyebrow: string;
    titleLead: string;
    titleEm: string;
    pendingHint: string;
    assigneeLabel: string;
    sheetButton: string;
    agendaAria: string;
    agendaLoading: string;
    unassigned: string;
    choosePrompt: string;
    changeAssignee: string;
    inProgressLabel: string;
    stepLabel: string;
    sheetAria: string;
    nextStepTitle: string;
    confirmHint: string;
    startHint: string;
    needWorker: string;
    workersTitle: string;
    workerNoun: string;
  }
> = {
  serviteca: {
    eyebrow: "Taller Mecánico",
    titleLead: "Agenda del",
    titleEm: "mecánico.",
    pendingHint: "Todas las solicitudes de serviteca, de cualquier fecha, para que las confirmes o canceles sin esperar al día de la cita.",
    assigneeLabel: "Mecánico a cargo",
    sheetButton: "Ficha y mecánico",
    agendaAria: "Agenda del taller",
    agendaLoading: "la agenda del taller",
    unassigned: "Sin mecánico asignado",
    choosePrompt: "Elige un mecánico…",
    changeAssignee: "Asignar mecánico",
    inProgressLabel: "En taller",
    stepLabel: "En Taller",
    sheetAria: "Ficha técnica de atención en taller",
    nextStepTitle: "Siguiente paso en el taller:",
    confirmHint: "Confirma la cita para asignarle box y repuestos.",
    startHint: "Indica que el vehículo ya ingresó y se comenzó el trabajo.",
    needWorker: "Elige al mecánico a cargo (abajo) antes de iniciar la atención.",
    workersTitle: "Mecánicos del taller",
    workerNoun: "mecánico",
  },
  grua: {
    eyebrow: "Servicio de grúas",
    titleLead: "Agenda de",
    titleEm: "grúas.",
    pendingHint: "Todas las solicitudes de grúa (traslados de autos, contenedores y más), de cualquier fecha, para que las confirmes o canceles y asignes a quien las hará.",
    assigneeLabel: "Gruero a cargo",
    sheetButton: "Ficha y gruero",
    agendaAria: "Agenda de grúas",
    agendaLoading: "la agenda de grúas",
    unassigned: "Sin gruero asignado",
    choosePrompt: "Elige un gruero…",
    changeAssignee: "Asignar gruero",
    inProgressLabel: "En servicio",
    stepLabel: "En servicio",
    sheetAria: "Ficha de atención del servicio de grúa",
    nextStepTitle: "Siguiente paso del servicio:",
    confirmHint: "Confirma el servicio para asignar el equipo y coordinar con el cliente.",
    startHint: "Indica que la grúa ya salió y el servicio comenzó.",
    needWorker: "Elige al gruero a cargo (abajo) antes de iniciar el servicio.",
    workersTitle: "Grueros",
    workerNoun: "gruero",
  },
};
