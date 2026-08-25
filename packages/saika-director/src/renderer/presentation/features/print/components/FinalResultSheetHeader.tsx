interface FinalResultSheetHeaderProps {
  championshipName: string;
  eventName: string;
  formattedDate: string;
  venue: string;
}

export function FinalResultSheetHeader({
  championshipName,
  eventName,
  formattedDate,
  venue,
}: FinalResultSheetHeaderProps) {
  return (
    <div className="final-result-header">
      <div className="header-title">
        <h1>{championshipName}</h1>
        <h2>{eventName} Final</h2>
        <div className="header-info">
          {formattedDate} / {venue}
        </div>
      </div>
    </div>
  );
}
