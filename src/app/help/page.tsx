import { Card, CardTitle } from "@/components/ui/Card";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Overview & Log",
    body: "Log is where you record food, symptoms, supplements, habits, workouts, and cycle entries as they happen. Overview pulls it back together — today's summary, recent activity, trends, and anything expiring soon — as the first thing you see.",
  },
  {
    title: "Logging late at night",
    body: "The day rolls over at 3 AM, not midnight. Anything you log between midnight and 3 AM counts as the day before, and the time defaults to 23:30 — so a 1 AM entry lands on the day you're still awake in, not tomorrow. From 3 AM the time and date behave normally again.",
  },
  {
    title: "Symptoms",
    body: "Tap a symptom once to mark it at intensity 1; tap again to raise it to 2, then 3; a fourth tap clears it. Recent activity and Overview order symptoms by the date you say they happened, not when you typed them in — so you can backdate freely.",
  },
  {
    title: "Meals",
    body: "The Food tab pre-selects a meal by time of day: Breakfast before noon, Lunch until 6 PM, Dinner after. Snack is never auto-picked — choose it yourself. You can change the meal on any entry afterwards from the day's list.",
  },
  {
    title: "Food, Workout, Cycle, Patterns",
    body: "Each is a dashboard reading back what you've logged for that area: charts, streaks, and patterns over time. Nothing to set up — they populate automatically from Log entries. The Spices food category is left out of the nutrition-priority analysis, so logging seasonings doesn't skew it.",
  },
  {
    title: "Notes",
    body: "Private messaging between you and your linked partner. The first time you open Notes, you'll either generate an invite code to send your partner, or enter a code they sent you — only one of you needs to do this. Starring a thread favourites it for both of you.",
  },
  {
    title: "Reminders & lists",
    body: "One-off tasks with a deadline and recurring chores, on the Log page. Reminders are organised into named lists (To Do, To Buy, and so on) — create, rename, and delete those lists on the Manage page; the Reminders tab just switches between them.",
  },
  {
    title: "Expiration",
    body: "Track products by their expiry date and set 'remind N days before'. A bell on the row shows a reminder is set. When one is due it also appears under Expiring soon on Overview, and — once notifications are on — sends a push and email.",
  },
  {
    title: "Home",
    body: "The shared, partner-facing counterpart to the Log page's private Notes, Reminders, and Expiration tabs. Once you and your partner are linked (via Notes), everything here is visible to both of you and either can complete it.",
  },
  {
    title: "Manage items",
    body: "Add, edit, or hide the specific foods, exercises, or products that show up as options when logging, manage your reminder lists, and toggle which Log tabs and Analytics sections appear.",
  },
  {
    title: "Journal",
    body: "A plain diary on the Log page — a date, an optional title, and a body. Each entry has visible edit and delete buttons; the list is searchable and sorts newest or oldest first.",
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
