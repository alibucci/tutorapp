/**
 * The Help page: how-to films and the same steps written out. The films are
 * served by Caddy from /opt/tutorapp/media/help (outside the app, so a release
 * never copies them) and only to a signed-in tutor - see /api/auth/media.
 *
 * A film's file name carries its version: a new cut gets a new name, so a
 * browser that cached the old one never shows it again.
 */
export const MEDIA = "/media/help";

export type HelpFilm = {
  id: string;
  title: string;
  /** One line: what the tutor gets from it. */
  why: string;
  file: string;
  poster: string;
  /** Seconds, for the label. */
  seconds: number;
  steps: string[];
  tip?: string;
};

export type CoreChapter = { id: string; title: string; at: number; steps: string[] };

export const CORE_FILM = {
  title: "The whole lesson cycle",
  why: "One lesson from start to finish: the student, the lesson, the debrief, the summary, the homework and the message home.",
  file: `${MEDIA}/help-core-v3.mp4`,
  poster: `${MEDIA}/help-core-v3.jpg`,
  seconds: 178,
};

export const CORE_CHAPTERS: CoreChapter[] = [
  {
    id: "C1", title: "Sign in and your account", at: 5,
    steps: [
      "Sign in with the email or username and password you were given.",
      "Open your account (the round button with your initial) and use \"Change your password\" the first time.",
    ],
  },
  {
    id: "C2", title: "Add a student", at: 15,
    steps: [
      "On the home screen click \"Add student\".",
      "Fill in name, age, English level and goal.",
      "In \"About them\" write a line about what they love. The homework theme is made from it.",
    ],
  },
  {
    id: "C3", title: "New lesson and recording", at: 33,
    steps: [
      "Click \"New lesson\", pick the student, give the lesson a title and choose the setting.",
      "Click \"Set up the mic\", check the input level moves, then \"Start lesson\".",
      "Teach as usual. When you correct a mistake, say it out loud: \"Not goed. Went.\"",
      "Click \"Finish & review\" at the end.",
    ],
  },
  {
    id: "C4", title: "The debrief", at: 54,
    steps: [
      "Click \"Start debrief\" and answer five short questions out loud, or \"Type it instead\".",
      "Use \"Next prompt\" between questions and \"Finish\" at the end.",
      "Fix any word the recogniser got wrong, then \"Save debrief\".",
    ],
  },
  {
    id: "C5", title: "The summary", at: 70,
    steps: [
      "The summary is written in under a minute: what matters, what you covered, what was hard and where to start next time.",
      "Not quite right? Click \"Regenerate\".",
    ],
  },
  {
    id: "C6", title: "Topics", at: 85,
    steps: [
      "Under \"Topics\" click \"Suggest changes\".",
      "Untick anything you do not agree with, then apply. Nothing changes until you do.",
    ],
  },
  {
    id: "C7", title: "Build the homework", at: 98,
    steps: [
      "In \"Homework\" click \"Build games\". The games are made from today's mistakes, in the student's own look.",
      "Edit the \"Tip\" in the child's own words.",
      "Click \"Preview what … will see\" to play it exactly as the child will.",
    ],
  },
  {
    id: "C8", title: "Send and see results", at: 125,
    steps: [
      "Click \"Send to …\". The tag reads \"Sent · waiting\".",
      "When the student has finished it reads \"Handed in\", with a score per game. \"See the answers\" shows every answer.",
    ],
  },
  {
    id: "C9", title: "The student's side", at: 137,
    steps: ["The student plays on their own link or sign-in, at home, in their theme."],
  },
  {
    id: "C10", title: "Message to the parent", at: 147,
    steps: [
      "Under \"Message to the parent\" open \"English · edit\", change anything, and \"Save and translate\".",
      "Open \"中文 · WeChat\" and click \"Copy for WeChat\". You always send it yourself.",
    ],
  },
  {
    id: "C11", title: "Your home screen", at: 161,
    steps: ["\"Needs you\" lists what is waiting for you; below it, what the children have been doing."],
  },
];

const film = (n: number) => ({ file: `${MEDIA}/help-a${n}-v1.mp4`, poster: `${MEDIA}/help-a${n}-v1.jpg` });

export const HELP_FILMS: HelpFilm[] = [
  {
    id: "A1", title: "Group lessons", ...film(1), seconds: 35,
    why: "One recording, and each child gets their own lesson, summary and homework.",
    steps: [
      "\"New lesson\", tick \"Group lesson\", and under \"Who else is in the lesson?\" tick the other children.",
      "Teach, and say each child's name when you speak to them.",
      "The debrief asks three questions about each child (\"Next: …\" moves to the next child).",
      "On \"Who said what\" check whose each line is - it is suggested from the names you called. Use \"Not sure\" when you do not know.",
      "Click \"Make each child's lesson\". Each child's lesson is then checked and sent one at a time.",
    ],
    tip: "Say each child's name out loud when you speak to them.",
  },
  {
    id: "A2", title: "Wrong student?", ...film(2), seconds: 19,
    why: "Fix a lesson or note that was started under the wrong child.",
    steps: [
      "On the lesson or note click \"Wrong student?\".",
      "Under \"It was really with\" choose the right student and click \"Move\".",
      "The summary, games and parent message are written again for that student.",
    ],
  },
  {
    id: "A3", title: "Extra homework from your own words", ...film(3), seconds: 26,
    why: "Practice on exactly what you ask for, without a lesson.",
    steps: [
      "On the student's page, under \"Extra homework\", describe it in your own words - for example \"adding and taking away up to 20\".",
      "Click \"Make homework\". The games open in the student's own look.",
      "\"Preview what … will see\", then \"Send to …\".",
    ],
    tip: "Sums and counting are made by code, so every answer is right and stays within your limit.",
  },
  {
    id: "A4", title: "Short tasks, look and theme", ...film(4), seconds: 22,
    why: "Change how one student's homework looks and feels.",
    steps: [
      "On the student's page, in \"About …\", edit the description.",
      "Switch \"Short tasks\" on for fewer, shorter tasks.",
      "Choose a \"Look\": automatic, \"A game, with points\" or \"Plain, no game\". Click \"Save\".",
      "\"Make a new theme\" draws a new theme from the description.",
      "Changes apply to the next homework; homework already sent stays as it was.",
    ],
    tip: "Describe interests, never health. Use \"Short tasks\" instead.",
  },
  {
    id: "A5", title: "Adult learners", ...film(5), seconds: 20,
    why: "Plain homework for adults: no game and no parent message.",
    steps: [
      "Give the student an adult age. The page then reads \"An adult: no parent message after lessons.\"",
      "Their homework is plain: listen and repeat, role-play, answering out loud and topic words.",
    ],
  },
  {
    id: "A6", title: "Pronunciation checks (adults)", ...film(6), seconds: 29,
    why: "An adult records a line and sees how it came out.",
    steps: [
      "The first time, the learner sees \"Check my pronunciation?\" and chooses \"Yes, check my pronunciation\" or \"Not now\".",
      "They tap \"Record\", say the line, then \"Stop\". A score appears with sounds, flow and rhythm, and one tip.",
      "The recording is never kept. You see the scores and what to work on.",
      "\"Stop checking my voice\" switches it off again.",
    ],
    tip: "Only the learner can switch it on. A tutor or a parent cannot.",
  },
  {
    id: "A7", title: "Your own picture for the homework", ...film(7), seconds: 13,
    why: "Replace the picture on a homework that has one.",
    steps: [
      "On a homework that already has a picture, click \"Upload my own\" and choose yours.",
      "The picture questions under \"With the picture\" stay with it.",
      "New homework is games only and has no picture step.",
    ],
  },
  {
    id: "A8", title: "Manage homework", ...film(8), seconds: 28,
    why: "Rebuild, take back or reset homework.",
    steps: [
      "Not happy with the games? \"Build different ones\".",
      "Sent too soon? \"Take back\".",
      "Want a second go after it was handed in? \"Let … do it again\", then \"Clear and hand back\".",
    ],
    tip: "\"Let … do it again\" clears the scores.",
  },
  {
    id: "A9", title: "Family sign-in and private links", ...film(9), seconds: 24,
    why: "Give the student and parent a way in.",
    steps: [
      "On the student's page, under \"Family sign-in\", click \"Create sign-in\".",
      "The password is shown once: click \"Copy sign-in message\" (Chinese and English) and send it, then \"Done\".",
      "\"Reset password\" and \"Remove\" are there later.",
      "Or open \"Private links, no password\" for a student link and a parent link.",
    ],
    tip: "The password is shown once. Copy the message before you leave the page.",
  },
  {
    id: "A10", title: "Weekly note", ...film(10), seconds: 23,
    why: "A short note for the parent about the week.",
    steps: [
      "On the student's page, under \"Weekly note\", click \"Draft this week\".",
      "Read it and edit any line.",
      "Click \"Approve\" so the family can read it when they sign in. \"Unpublish\" takes it back.",
    ],
    tip: "Approving makes the note visible to the family. It does not message them.",
  },
  {
    id: "A11", title: "Notifications: email and Telegram", ...film(11), seconds: 29,
    why: "Hear when a student has finished.",
    steps: [
      "Open your account. Under \"Email\" type your address and click \"Send a confirmation link\".",
      "Open the link in that email (it is valid for 48 hours). The tag turns to \"On\".",
      "\"Send a test email\" checks it works. \"Change address\" and \"Switch off\" are there too.",
      "For Telegram click \"Connect Telegram\" and press Start in Telegram.",
    ],
    tip: "Telegram needs a VPN in mainland China. Email works without one.",
  },
  {
    id: "A12", title: "Archive and restore a student", ...film(12), seconds: 20,
    why: "Stop working with a student without losing anything.",
    steps: [
      "On the student's page click \"Archive student\" and confirm \"Archive\". Their links and sign-in stop working.",
      "They move to \"Archived\" at the bottom of your home screen.",
      "Open them and click \"Restore\" to bring everything back.",
    ],
  },
  {
    id: "A13", title: "Your first note about a new student", ...film(13), seconds: 36,
    why: "Start before the first lesson.",
    steps: [
      "On a new student's page, under \"Tell the app about …\", choose the language and click \"Record a note\".",
      "Click \"Start\" and answer five short questions out loud, or \"Type it instead\".",
      "Fix any word the recogniser got wrong and click \"Save note\".",
      "The summary and the note home are written; \"Build games\" makes the first practice.",
    ],
  },
  {
    id: "A14", title: "Teaching in the room", ...film(14), seconds: 13,
    why: "Record an in-person lesson with one phone.",
    steps: [
      "In \"New lesson\", under \"Setting\", choose \"Physical classroom\".",
      "Put your phone near you. Only speech close to it is written down, and audio is never saved.",
    ],
  },
  {
    id: "A15", title: "If a recording is interrupted", ...film(15), seconds: 20,
    why: "Carry on when a call drops or the phone sleeps.",
    steps: [
      "The transcript is saved as you go.",
      "Open the lesson again: choose \"Continue recording\" or \"End it and record the debrief\".",
    ],
    tip: "Keep the screen on during a lesson.",
  },
];

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
