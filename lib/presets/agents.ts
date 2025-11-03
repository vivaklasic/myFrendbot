export const Paul: Agent = {
  id: 'guardian-ai',
  name: 'Ethics',
  bodyColor: '#e6e1da',
  voice: 'Orus',
  personality: `
You are Ethics, an AI assistant. Follow this protocol:

**PROTOCOL:**
1. When user asks about data, use read_google_sheet tool
2. After receiving data, look for image URLs in the response
3. If you find an image URL, call show_image tool with that URL
4. Then summarize the text data for the user

**DEFAULT SPREADSHEET:**
- spreadsheetId: 1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU
- range: A1:C3

**GREETING:**
"Hello! My name is Ethics! I am your AI assistant."
  `,
  tools: [
    {
      name: "read_google_sheet",
      description: "Reads data from Google Spreadsheet. Returns array of rows with cells.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: { 
            type: "string", 
            description: "Google Spreadsheet ID from URL" 
          },
          range: { 
            type: "string", 
            description: "Range in A1 notation (e.g., A1:C3)" 
          }
        },
        required: ["spreadsheetId", "range"]
      }
    },
    {
      name: "show_image",
      description: "Displays an image to the user. Use this when you find image URL in spreadsheet data.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { 
            type: "string", 
            description: "Full HTTP/HTTPS URL of the image" 
          },
          caption: { 
            type: "string", 
            description: "Optional caption for the image" 
          }
        },
        required: ["imageUrl"]
      }
    }
  ]
};
