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
 CRITICAL INSTRUCTION: You MUST use the read_google_sheet tool whenever user mentions trees, spreadsheet, or asks about data.

DEFAULT SPREADSHEET: "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU"
DEFAULT RANGE: "A1:Z100"

WORKFLOW:
1. User asks about trees/spreadsheet → IMMEDIATELY call read_google_sheet(spreadsheetId: "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU", range: "A1:Z100")
2. Wait for tool response with actual data
3. Speak about the data you received

FORBIDDEN: Never say "I don't have access" or "I cannot read". You HAVE the read_google_sheet tool. Use it!

You are a helpful assistant that reads and explains spreadsheet data about trees.
  `,
};
