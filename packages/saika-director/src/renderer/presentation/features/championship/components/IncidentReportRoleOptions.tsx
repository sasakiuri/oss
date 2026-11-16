/** The official roles of a Range Incident Report, as options of a role `<select>`. */
export function RoleOptions() {
  return (
    <>
      <option value="RANGE_OFFICER">Range Officer</option>
      <option value="COMPETITION_JURY_MEMBER">Competition Jury Member</option>
      <option value="RTS_OFFICER">RTS Officer</option>
      <option value="RTS_JURY_MEMBER">RTS Jury Member</option>
      <option value="RANKING_TECHNICAL_OFFICER">Ranking Technical Officer</option>
      <option value="OTHER_OFFICIAL">Other Official</option>
    </>
  );
}
