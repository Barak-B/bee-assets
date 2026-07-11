// monday-board-sync.js
//
// Syncs a tender object to a Monday.com "Tenders" board.
// Creates the board (with right columns) if missing on first run.

import fetch from "node-fetch";

const MONDAY_API = "https://api.monday.com/v2";

/**
 * Ensure the "Tenders" board exists. On first run, creates it
 * with the proper columns and saves the IDs back to config.
 *
 * @param {object} config
 * @returns {Promise<{board_id, column_ids}>}
 */
export async function ensureBoard(config) {
  const { monday } = config;

  if (monday.board_id && monday.column_ids?.name) {
    return { board_id: monday.board_id, column_ids: monday.column_ids };
  }

  // Try to find existing board by name
  const existing = await findBoardByName(monday.api_token, monday.board_name);
  if (existing) {
    console.log(`[monday] Found existing board: ${existing.id}`);
    const columns = await fetchColumns(monday.api_token, existing.id);
    return { board_id: existing.id, column_ids: mapColumns(columns) };
  }

  // Create new board
  console.log(`[monday] Creating board "${monday.board_name}"...`);
  const newBoard = await createBoard(monday.api_token, monday.board_name);
  await createColumns(monday.api_token, newBoard.id);
  const columns = await fetchColumns(monday.api_token, newBoard.id);
  return { board_id: newBoard.id, column_ids: mapColumns(columns) };
}

/**
 * Sync a tender to Monday — creates new item if no monday_item_id yet,
 * otherwise updates existing item.
 *
 * @param {{board_id, column_ids}} boardCtx
 * @param {object} tender
 * @returns {Promise<string|null>} monday_item_id
 */
export async function syncToMonday(boardCtx, tender, config) {
  if (!boardCtx) return null;

  const { board_id, column_ids } = boardCtx;
  const colValues = {
    [column_ids.source]: { label: tender.source },
    [column_ids.deadline]: { date: tender.deadline_date },
    [column_ids.status]: { label: "פתוח" },
    [column_ids.bee_tender_id]: tender.id,
    [column_ids.link]: { url: tender.source_url, text: "מקור" },
  };

  if (tender.estimated_value_nis) {
    colValues[column_ids.estimated_value] = tender.estimated_value_nis;
  }

  const mutation = `
    mutation CreateTender($boardId: ID!, $itemName: String!, $colValues: JSON!) {
      create_item(
        board_id: $boardId,
        item_name: $itemName,
        column_values: $colValues
      ) { id }
    }
  `;

  try {
    const result = await mondayGql(config.monday.api_token, mutation, {
      boardId: board_id,
      itemName: tender.name_he,
      colValues: JSON.stringify(colValues),
    });
    return result.create_item?.id;
  } catch (e) {
    console.error(`[monday] sync failed: ${e.message}`);
    return null;
  }
}

// ===== Helpers =====

async function mondayGql(token, query, variables = {}) {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: {
      "Authorization": token,
      "Content-Type": "application/json",
      "API-Version": "2024-04",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday API: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function findBoardByName(token, name) {
  const q = `query { boards(limit: 100) { id name } }`;
  const data = await mondayGql(token, q);
  return data.boards.find((b) => b.name === name) || null;
}

async function createBoard(token, name) {
  const m = `
    mutation CreateBoard($name: String!) {
      create_board(board_name: $name, board_kind: public) { id name }
    }
  `;
  const data = await mondayGql(token, m, { name });
  return data.create_board;
}

async function createColumns(token, boardId) {
  const columns = [
    { title: "מקור", type: "status", settings_str: JSON.stringify({
      labels: { "1": "gov.il", "2": "עירייה", "3": "פרטי", "4": "ידני" }
    })},
    { title: "Deadline", type: "date" },
    { title: "ערך מוערך (₪)", type: "numbers" },
    { title: "סטטוס", type: "status", settings_str: JSON.stringify({
      labels: { "1": "פתוח", "2": "בהכנה", "3": "הוגש", "4": "זכינו", "5": "לא זכינו", "6": "נסגר", "7": "פספסנו" }
    })},
    { title: "הסתברות זכייה", type: "numbers" },
    { title: "BEE Tender ID", type: "text" },
    { title: "קישור", type: "link" },
  ];

  for (const col of columns) {
    const m = `
      mutation CreateCol($boardId: ID!, $title: String!, $type: ColumnType!, $defaults: String) {
        create_column(board_id: $boardId, title: $title, column_type: $type, defaults: $defaults) {
          id title
        }
      }
    `;
    try {
      await mondayGql(token, m, {
        boardId,
        title: col.title,
        type: col.type,
        defaults: col.settings_str || null,
      });
    } catch (e) {
      console.warn(`[monday] Failed creating column ${col.title}: ${e.message}`);
    }
  }
}

async function fetchColumns(token, boardId) {
  const q = `
    query GetColumns($boardId: [ID!]) {
      boards(ids: $boardId) {
        columns { id title type }
      }
    }
  `;
  const data = await mondayGql(token, q, { boardId: [boardId] });
  return data.boards[0]?.columns || [];
}

function mapColumns(columns) {
  // Map Hebrew titles → semantic keys for our code
  const titleToKey = {
    "מקור": "source",
    "Deadline": "deadline",
    "ערך מוערך (₪)": "estimated_value",
    "סטטוס": "status",
    "הסתברות זכייה": "win_probability",
    "BEE Tender ID": "bee_tender_id",
    "קישור": "link",
  };

  const map = { name: "name" };  // name column is built-in
  for (const col of columns) {
    const key = titleToKey[col.title];
    if (key) map[key] = col.id;
  }
  return map;
}
