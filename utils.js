export const getUserLeagueData = async (client, uid) => {
  const result = await client.query(
    'SELECT u.league_id, u.role, u.full_name, u.email, l.league_name FROM users u JOIN leagues l ON l.id = u.league_id WHERE u.uid = $1', 
    [uid]
  );
  if (result.rows.length > 0) {
    return { league_id: result.rows[0].league_id, role: result.rows[0].role, full_name: result.rows[0].full_name, email: result.rows[0].email, league_name: result.rows[0].league_name};
  }
  return { league_id: null, role: "none" };
};


