import type { PatternAssessment, Reflection, WellbeingExercise } from "@/lib/types";

const exercises: Record<string, WellbeingExercise> = {
  breathing: {
    id: "paced-breathing",
    title: "Paced breathing",
    duration: "2 minutes",
    reason: "Useful when stress is high and attention feels scattered.",
    steps: ["Inhale gently for 4 seconds.", "Exhale for 6 seconds.", "Repeat ten times without forcing the breath."],
  },
  grounding: {
    id: "five-senses",
    title: "Five-senses grounding",
    duration: "3 minutes",
    reason: "Useful when thoughts are racing or the next step feels hard to find.",
    steps: ["Name 5 things you see.", "Name 4 things you feel and 3 things you hear.", "Name 2 things you smell and 1 thing you appreciate right now."],
  },
  recovery: {
    id: "screen-free-reset",
    title: "Screen-free reset",
    duration: "10 minutes",
    reason: "Useful when work has displaced breaks or recovery.",
    steps: ["Leave the work surface and put the phone down.", "Drink water or eat something simple.", "Move, stretch, or step outside before choosing the next task."],
  },
  task: {
    id: "good-enough-plan",
    title: "Good-enough plan",
    duration: "5 minutes",
    reason: "Useful when workload is high and perfection is consuming capacity.",
    steps: ["Choose one deadline.", "Write the smallest acceptable submission.", "Set one short work block and a stopping time."],
  },
  connection: {
    id: "low-pressure-connection",
    title: "Low-pressure connection",
    duration: "5 minutes",
    reason: "Useful when you have been withdrawing from people.",
    steps: ["Choose one person who usually feels safe.", "Send a simple message: “I have had a heavy day. Can we check in soon?”", "You do not need to explain everything at once."],
  },
  sleep: {
    id: "wind-down-boundary",
    title: "Wind-down boundary",
    duration: "15 minutes",
    reason: "Useful when late work and reduced sleep repeat together.",
    steps: ["Choose a hard stopping time for schoolwork.", "Write tomorrow’s first step so your mind does not have to hold it.", "Lower lights and avoid starting another optional task."],
  },
};

export function recommendedExercises(
  reflections: Reflection[],
  assessment: PatternAssessment,
): WellbeingExercise[] {
  const themes = new Set(reflections.slice(0, 7).flatMap((entry) => entry.analysis.themes));
  const selected: WellbeingExercise[] = [];
  if (assessment.score >= 52) selected.push(exercises.breathing);
  if (themes.has("missed breaks") || themes.has("schedule compression")) selected.push(exercises.recovery);
  if (themes.has("high workload") || themes.has("low motivation")) selected.push(exercises.task);
  if (themes.has("late work") || themes.has("reduced sleep")) selected.push(exercises.sleep);
  if (themes.has("social withdrawal")) selected.push(exercises.connection);
  selected.push(exercises.grounding);
  return [...new Map(selected.map((exercise) => [exercise.id, exercise])).values()].slice(0, 4);
}
