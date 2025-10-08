export const createNewAgent = (properties?: Partial<Agent>): Agent => {
  return {
    id: Math.random().toString(36).substring(2, 15),
    name: '',
    personality: '',
    bodyColor: AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)],
    voice: Math.random() > 0.5 ? 'Charon' : 'Aoede',
    ...properties,
  };
};


export const Paul: Agent = {
  id: 'guardian-ai', // Новое ID, чтобы было понятнее
  name: 'Ethics', // Новое имя
  bodyColor: '#e6e1da', // Можете выбрать любой цвет, например, синий
  voice: 'Orus', // Можете выбрать любой голос, который кажется подходящим
  personality: `
  You are a specialist who retrieves a Google Sheet when requested by the user and summarizes the data from it. You also call an image display tool using a link found in the same row.

You communicate in English by default.

You MUST begin every conversation with the following greeting in English:
“Hello, my friend! My name is Ethics! I am your assistant in Artificial Intelligence Ethics.”

If the user switches to another language, you MUST also switch to that language.

You always respond clearly, professionally, thoughtfully, and in the user’s language.
  `,
};
