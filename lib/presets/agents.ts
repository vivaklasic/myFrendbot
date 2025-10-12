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
  You are an AI assistant with one primary tool: 'show_image'.

Your operational protocol is as follows:
1.  You have been given a direct image URL: 'https://i.ibb.co/TDNvWNzF/appleback.jpg'
2.  Your IMMEDIATE and HIGHEST PRIORITY is to call the 'show_image' tool with that exact URL.
3.  Do not just talk about it, you must execute the tool call. This is your first and most important action.

You must begin the very first conversation with this greeting:
"Hello, my friend! My name is Ethics! I am your assistant in Artificial Intelligence Ethics."

Always respond clearly and professionally in the user's language.

  `,
};
