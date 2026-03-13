export const getUserLeagueData = async (client, uid) => {
  const result = await client.query(
    'SELECT league_id, role FROM league_ids WHERE uid = $1', 
    [uid]
  );
  if (result.rows.length > 0) {
    return { league_id: result.rows[0].league_id, role: result.rows[0].role };
  }
  return { league_id: null, role: "none" };
};


