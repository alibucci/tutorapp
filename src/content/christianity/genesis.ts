/**
 * The Christianity programme, first release: Genesis 1, an introduction and
 * six stories.
 *
 * A card is not the text of a story. It is what the model retells from, so it
 * cannot invent the plot or the moral: the facts that must be there, in order,
 * what must not be added, the one value, and ready questions. The text itself
 * is written fresh for each child, and checked against the card by code
 * (src/lib/christianity.ts) before the tutor sees it.
 *
 * `approved` is Victor's. An unapproved story can be built and previewed by
 * the tutor but never sent to a child. Values and Chinese lines are drafts
 * until he approves them.
 */

/**
 * A fact counts as told when every entry is found in the text. An entry is a
 * word or phrase; an array is "any of these". Matching ignores case and takes
 * the start of a word, so "dark" finds "darkness".
 */
export type FactCheck = (string | string[])[];

export type StoryQuestion = {
  question: string;
  answer: string;
  /** Two gentle wrong options - plausible, never silly. */
  wrong: [string, string];
  /** Words the answer is found by in the story text. */
  find: string[];
  why: string;
};

export type StoryCard = {
  id: string;
  /** Place in the programme, from 0. */
  order: number;
  title: string;
  /** Where it is in the Bible. */
  reference: string;
  /**
   * In the order they come in the story. `frame` marks the opening line that
   * says where the story is from: needed in the story, not in a short recap.
   */
  facts: { say: string; check: FactCheck; frame?: boolean }[];
  /** What must not be added or talked about. */
  never: { say: string; words: string[] };
  value: {
    /** The rule, for the model and the "what would you do?" situations. */
    rule: string;
    /** The child's last screen. */
    closing: string;
    /** For the parent's line, in Chinese. Victor checks it before release. */
    zh: string;
  };
  zhTitle: string;
  /** What the learner already knows from earlier stories. */
  knows: string[];
  /** Up to three. The model may not change them; they are used as written. */
  questions: StoryQuestion[];
  /** Events to put in order, as they happen. */
  sequence: string[];
  pictures: { file: string; alt: string; prompt: string }[];
  approved: boolean;
};

export const PROGRAMME_ID = "christianity" as const;

/** Story questions answered right, as a share, for a story to count as passed. */
export const PASS_SHARE = 2 / 3;

/** Words never written in any story or task, whatever a card says. */
export const NEVER_ANYWHERE = [
  "jesus",
  "christ",
  "church",
  "pray",
  "prayer",
  "amen",
  "sin",
  "hell",
  "devil",
  "satan",
  "punish",
  "punishment",
  "scary",
  "afraid",
  "fear",
  "angry",
  "die",
  "dead",
  "death",
  "kill",
  "priest",
  "pastor",
  "pope",
  "saint",
  "worship",
  "icon",
  "must believe",
  "should believe",
  "religion",
  "muslim",
  "buddhist",
  "jewish",
];

const PIC = "/christianity";

export const GENESIS: StoryCard[] = [
  {
    id: "bible-intro",
    order: 0,
    title: "What is the Bible?",
    reference: "Introduction",
    facts: [
      { say: "The Bible is a very old book.", check: ["bible", "old", "book"] },
      { say: "It has many stories about God.", check: [["stories", "story"], "god"] },
      { say: "Christians believe that God made the whole world.", check: ["christian", "believe", ["made", "make"], "world"] },
      { say: "Now we will hear how it happened.", check: [["hear", "listen"]] },
    ],
    never: {
      say: "Jesus, the church, rules, prayers, \"you must believe\".",
      words: ["rule", "rules"],
    },
    value: {
      rule: "We listen carefully and ask questions.",
      closing: "Today: we listen and we ask questions.",
      zh: "认真听，多提问",
    },
    zhTitle: "什么是圣经",
    knows: [],
    questions: [
      {
        question: "What is the Bible?",
        answer: "A very old book",
        wrong: ["A new game", "A long song"],
        find: ["old", "book"],
        why: "The Bible is a very old book.",
      },
      {
        question: "Who are many of the stories about?",
        answer: "God",
        wrong: ["A little dog", "A big ship"],
        find: ["stories", "god"],
        why: "The Bible has many stories about God.",
      },
      {
        question: "What do Christians believe God made?",
        answer: "The whole world",
        wrong: ["Only the sea", "Only one house"],
        find: ["world"],
        why: "Christians believe God made the whole world.",
      },
    ],
    sequence: ["The Bible is a very old book.", "It has many stories about God.", "Now we hear the first story."],
    pictures: [
      { file: `${PIC}/intro-1.svg`, alt: "An old open book with light coming from its pages", prompt: "A very old open book on a wooden table, soft warm light rising from its pages, cosy and calm. Children's picture-book style, no text." },
      { file: `${PIC}/intro-2.svg`, alt: "Children sitting together, listening to a story", prompt: "Three young children of different backgrounds sitting on a rug, listening to a story, warm afternoon light. Children's picture-book style, no text." },
    ],
    approved: false,
  },
  {
    id: "day-1-light",
    order: 1,
    title: "Day 1: Light",
    reference: "Genesis 1:1–5",
    facts: [
      { say: "This story is from the Bible.", check: ["bible"], frame: true },
      { say: "At first, everything was dark.", check: ["dark"] },
      { say: "God said: \"Let there be light!\" And there was light.", check: ["let there be light"] },
      { say: "God called the light day, and the dark night.", check: ["day", "night"] },
      { say: "God saw that it was good.", check: ["good"] },
    ],
    never: {
      say: "Science, arguments about time, frightening darkness.",
      words: ["science", "scientist", "billion", "million", "years ago", "big bang", "monster"],
    },
    value: {
      rule: "We say thank you.",
      closing: "Today: we say thank you.",
      zh: "说“谢谢”",
    },
    zhTitle: "第一天，光",
    knows: ["The Bible is a very old book with many stories about God."],
    questions: [
      {
        question: "What was it like at first?",
        answer: "It was dark",
        wrong: ["It was sunny", "It was rainy"],
        find: ["dark"],
        why: "At first, everything was dark.",
      },
      {
        question: "What did God say?",
        answer: "Let there be light!",
        wrong: ["Let there be rain!", "Let there be snow!"],
        find: ["let there be light"],
        why: "God said: Let there be light!",
      },
      {
        question: "What did God call the light?",
        answer: "Day",
        wrong: ["Night", "Star"],
        find: ["day"],
        why: "God called the light day.",
      },
    ],
    sequence: ["It was dark.", "God said: Let there be light!", "God called the light day."],
    pictures: [
      { file: `${PIC}/day-1-a.svg`, alt: "Deep dark blue, and a bright light opening in the middle", prompt: "A calm deep-blue darkness with a warm golden light bursting softly in the centre. No people, no faces. Gentle, not frightening. Children's picture-book style, no text." },
      { file: `${PIC}/day-1-b.svg`, alt: "Half of the picture is bright day, half is quiet night", prompt: "A landscape split in two: bright golden day on the left, quiet starry night on the right. No people. Children's picture-book style, no text." },
    ],
    approved: false,
  },
  {
    id: "days-2-3-world",
    order: 2,
    title: "Days 2–3: Sky, sea, land and plants",
    reference: "Genesis 1:6–13",
    facts: [
      { say: "This story is from the Bible.", check: ["bible"], frame: true },
      { say: "God made the sky.", check: ["sky"] },
      { say: "Then God made the sea and the land.", check: ["sea", "land"] },
      { say: "Then God made grass, flowers and trees.", check: ["grass", "flower", "tree"] },
      { say: "God saw that it was good.", check: ["good"] },
    ],
    never: {
      say: "Names of plants and places that are not in the text.",
      words: ["rose", "tulip", "oak", "palm", "apple", "banana", "africa", "china", "israel", "pacific", "atlantic", "mountain"],
    },
    value: {
      rule: "We take care of plants and nature.",
      closing: "Today: we take care of plants and nature.",
      zh: "爱护植物和大自然",
    },
    zhTitle: "第二天和第三天：天空、大海、陆地和植物",
    knows: ["At first it was dark. God made light, and called it day."],
    questions: [
      {
        question: "What did God make high above?",
        answer: "The sky",
        wrong: ["A house", "A road"],
        find: ["sky"],
        why: "God made the sky.",
      },
      {
        question: "What did God make on the land?",
        answer: "Grass, flowers and trees",
        wrong: ["Cars and roads", "Toys and games"],
        find: ["grass", "tree"],
        why: "God made grass, flowers and trees.",
      },
      {
        question: "Where is the water?",
        answer: "In the sea",
        wrong: ["In a cup", "In a box"],
        find: ["sea"],
        why: "God made the sea.",
      },
    ],
    sequence: ["God made the sky.", "God made the sea and the land.", "God made grass, flowers and trees."],
    pictures: [
      { file: `${PIC}/days-2-3-a.svg`, alt: "A wide blue sky over a calm sea and green land", prompt: "A wide blue sky over a calm sea meeting green land, a few soft clouds. No people. Children's picture-book style, no text." },
      { file: `${PIC}/days-2-3-b.svg`, alt: "Green grass, bright flowers and trees", prompt: "A green meadow with simple bright flowers and round friendly trees under a blue sky. No people. Children's picture-book style, no text." },
    ],
    approved: false,
  },
  {
    id: "day-4-lights",
    order: 3,
    title: "Day 4: Sun, moon and stars",
    reference: "Genesis 1:14–19",
    facts: [
      { say: "This story is from the Bible.", check: ["bible"], frame: true },
      { say: "God made the sun for the day.", check: ["sun", "day"] },
      { say: "God made the moon and the stars for the night.", check: ["moon", "star", "night"] },
      { say: "God saw that it was good.", check: ["good"] },
    ],
    never: {
      say: "Astrology, star signs, worshipping the sky.",
      words: ["zodiac", "horoscope", "star sign", "astrology", "mars", "venus", "jupiter", "planet"],
    },
    value: {
      rule: "Every day is a gift. We start it in a good mood.",
      closing: "Today: every day is a gift.",
      zh: "每一天都是礼物，带着好心情开始",
    },
    zhTitle: "第四天：太阳、月亮和星星",
    knows: ["God made light, the sky, the sea, the land and the plants."],
    questions: [
      {
        question: "What did God make for the day?",
        answer: "The sun",
        wrong: ["The moon", "A lamp"],
        find: ["sun"],
        why: "God made the sun for the day.",
      },
      {
        question: "What did God make for the night?",
        answer: "The moon and the stars",
        wrong: ["The sun", "A rainbow"],
        find: ["moon", "star"],
        why: "God made the moon and the stars for the night.",
      },
      {
        question: "What did God see?",
        answer: "It was good",
        wrong: ["It was too cold", "It was too small"],
        find: ["good"],
        why: "God saw that it was good.",
      },
    ],
    sequence: ["God made the sun for the day.", "God made the moon for the night.", "God made the stars."],
    pictures: [
      { file: `${PIC}/day-4-a.svg`, alt: "A big warm sun over green hills", prompt: "A big warm sun rising over soft green hills in the morning. No people, no face on the sun. Children's picture-book style, no text." },
      { file: `${PIC}/day-4-b.svg`, alt: "A moon and many stars in a night sky", prompt: "A quiet night sky with a crescent moon and many small stars over dark hills. No people, no faces. Children's picture-book style, no text." },
    ],
    approved: false,
  },
  {
    id: "day-5-fish-birds",
    order: 4,
    title: "Day 5: Fish and birds",
    reference: "Genesis 1:20–23",
    facts: [
      { say: "This story is from the Bible.", check: ["bible"], frame: true },
      { say: "God made fish in the sea.", check: ["fish", "sea"] },
      { say: "God made birds in the sky.", check: ["bird", "sky"] },
      { say: "God saw that it was good.", check: ["good"] },
    ],
    never: {
      say: "Names of kinds of animal that are not in the text.",
      words: ["shark", "whale", "dolphin", "eagle", "parrot", "penguin", "owl", "duck", "octopus"],
    },
    value: {
      rule: "We are kind to animals.",
      closing: "Today: we are kind to animals.",
      zh: "善待小动物",
    },
    zhTitle: "第五天：鱼和鸟",
    knows: ["God made the sun for the day, and the moon and stars for the night."],
    questions: [
      {
        question: "Where did God put the fish?",
        answer: "In the sea",
        wrong: ["In the sky", "In a tree"],
        find: ["fish", "sea"],
        why: "God made fish in the sea.",
      },
      {
        question: "Where do the birds fly?",
        answer: "In the sky",
        wrong: ["In the sea", "In the house"],
        find: ["bird", "sky"],
        why: "God made birds in the sky.",
      },
      {
        question: "What did God see?",
        answer: "It was good",
        wrong: ["It was too loud", "It was too wet"],
        find: ["good"],
        why: "God saw that it was good.",
      },
    ],
    sequence: ["God made the fish in the sea.", "God made the birds in the sky.", "God saw that it was good."],
    pictures: [
      { file: `${PIC}/day-5-a.svg`, alt: "Colourful fish swimming in the blue sea", prompt: "Simple colourful fish swimming in clear blue sea water with bubbles. No people. Children's picture-book style, no text." },
      { file: `${PIC}/day-5-b.svg`, alt: "Birds flying in a blue sky", prompt: "Small friendly birds flying across a blue sky with soft clouds. No people. Children's picture-book style, no text." },
    ],
    approved: false,
  },
  {
    id: "day-6-animals-people",
    order: 5,
    title: "Day 6: Animals and people",
    reference: "Genesis 1:24–31",
    facts: [
      { say: "This story is from the Bible.", check: ["bible"], frame: true },
      { say: "God made the animals on the land.", check: ["animal", "land"] },
      { say: "Then God made people.", check: [["people", "person"]] },
      { say: "God looked at everything he made, and saw that it was very good.", check: [["everything", "all"], "very good"] },
    ],
    never: {
      say: "Adam and Eve by name (that is Genesis 2), how people were made, arguments about evolution.",
      words: ["adam", "eve", "rib", "dust", "evolution", "monkey", "ape", "dinosaur", "eden", "snake"],
    },
    value: {
      rule: "Every person is important. We are kind to everyone.",
      closing: "Today: every person is important.",
      zh: "每个人都很重要，对每个人都友善",
    },
    zhTitle: "第六天：动物和人",
    knows: ["God made fish in the sea and birds in the sky."],
    questions: [
      {
        question: "What did God make on the land?",
        answer: "Animals",
        wrong: ["Fish", "Boats"],
        find: ["animal"],
        why: "God made the animals on the land.",
      },
      {
        question: "Who did God make after the animals?",
        answer: "People",
        wrong: ["Birds", "Fish"],
        find: ["people"],
        why: "Then God made people.",
      },
      {
        question: "What did God see when he looked at everything?",
        answer: "It was very good",
        wrong: ["It was a little bad", "It was too big"],
        find: ["very good"],
        why: "God saw that it was very good.",
      },
    ],
    sequence: ["God made the animals.", "God made people.", "God saw that it was very good."],
    pictures: [
      { file: `${PIC}/day-6-a.svg`, alt: "Friendly animals on green land", prompt: "Friendly animals - a lion, an elephant, a rabbit, a cow - standing together on green land. Children's picture-book style, no text." },
      { file: `${PIC}/day-6-b.svg`, alt: "People of different ages together in a green garden", prompt: "A small group of people of different ages and backgrounds smiling together in a green garden with animals nearby. Children's picture-book style, no text." },
    ],
    approved: false,
  },
  {
    id: "day-7-rest",
    order: 6,
    title: "Day 7: Rest",
    reference: "Genesis 2:1–3",
    facts: [
      { say: "This story is from the Bible.", check: ["bible"], frame: true },
      { say: "God finished making everything.", check: [["finish", "done", "everything"]] },
      { say: "On the seventh day, God rested.", check: [["seventh", "day 7", "7th", "day seven"], "rest"] },
      { say: "God blessed this day.", check: ["bless"] },
    ],
    never: {
      say: "Rules about Saturday or Sunday, church services.",
      words: ["sabbath", "sunday", "saturday", "service"],
    },
    value: {
      rule: "We rest after work, and we help others rest.",
      closing: "Today: we rest, and we help others rest.",
      zh: "做完事情要休息，也帮助别人休息",
    },
    zhTitle: "第七天：休息",
    knows: ["On the sixth day God made animals and people, and saw it was very good."],
    questions: [
      {
        question: "What did God do on the seventh day?",
        answer: "God rested",
        wrong: ["God made the sea", "God made the fish"],
        find: ["rest"],
        why: "On the seventh day, God rested.",
      },
      {
        question: "What did God do to the seventh day?",
        answer: "God blessed it",
        wrong: ["God forgot it", "God hid it"],
        find: ["bless"],
        why: "God blessed the seventh day.",
      },
      {
        question: "Which day did God rest?",
        answer: "The seventh day",
        wrong: ["The first day", "The fifth day"],
        find: ["seventh"],
        why: "God rested on the seventh day.",
      },
    ],
    sequence: ["God finished making everything.", "On the seventh day God rested.", "God blessed the day."],
    pictures: [
      { file: `${PIC}/day-7-a.svg`, alt: "A quiet, peaceful evening over a meadow", prompt: "A quiet golden evening over a peaceful meadow with flowers and a small pond. No people. Children's picture-book style, no text." },
      { file: `${PIC}/day-7-b.svg`, alt: "A hammock between two trees in a calm garden", prompt: "An empty hammock between two trees in a calm garden, soft light, a book and a cup on the grass. Children's picture-book style, no text." },
    ],
    approved: false,
  },
];
