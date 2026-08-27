import { Card, CardTitle } from "@/components/ui/Card";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Overview & Log",
    body: "Log is where you record food, workouts, and cycle entries as they happen. Overview pulls it back together — today's summary, recent activity, trends, a calendar, and your partner's shared notes — as the first thing you see.",
  },
  {
    title: "Food, Workout, Cycle",
    body: "Each is a dashboard reading back what you've logged for that area: charts, streaks, and patterns over time. Nothing to set up — they populate automatically from Log entries.",
  },
  {
    title: "Notes",
    body: "Private messaging between you and your linked partner. The first time you open Notes, you'll either generate an invite code to send your partner, or enter a code they sent you — only one of you needs to do this. Once linked, either of you can start a thread.",
  },
  {
    title: "Personal reminders",
    body: "To-dos and recurring tasks visible only to you.",
  },
  {
    title: "Home reminders",
    body: "The same as Personal, but shared: once you and your partner are linked (via Notes), tasks, notes, and product-expiration entries here are visible to both of you, and either of you can complete them.",
  },
  {
    title: "Manage items",
    body: "Add, edit, or hide the specific foods, exercises, or products that show up as options when logging — and toggle which Analytics sections appear in the sidebar.",
  },
  {
    title: "My Drive",
    body: "A read-only browser for your own Google Drive, if you choose to connect it.",
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Help
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          A quick reference for what each part of Lauva does.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <Card key={section.title} tier="supporting">
            <CardTitle>{section.title}</CardTitle>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {section.body}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
