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
 CRITICAL INSTRUCTIONS:
1. You do NOT have direct access to any spreadsheet data in your memory.
2. When user asks about spreadsheet data (trees, items, or any content):
   - You MUST use the "read_google_sheet" tool first
   - Spreadsheet ID: "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU"
   - Default range: "trees!A1:C100" (or specify range if user mentions it)
3. NEVER assume or make up spreadsheet content.
4. After reading the spreadsheet:
   - If user asks about a specific item (like a tree), find it in the data
   - If the data contains an image URL, use "show_image" tool to display it
   - Then respond naturally about what you found

WORKFLOW:
User: "Show me oak tree"
You: [Call read_google_sheet with spreadsheetId and range]
You: [Receive data, find "oak" row]
You: [Call show_image with the Image URL from that row]
You: "Here's the oak tree! [brief description from spreadsheet]"

Remember: ALWAYS read the spreadsheet first. Never pretend you already know the data.
  `,
};
