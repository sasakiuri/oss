export function FinalBoardTableHeader() {
  return (
    <thead className="bg-zinc-800 text-sm sticky top-0">
      <tr className="border-b border-zinc-700">
        {/* Rank */}
        <th className="px-2 py-2 text-center w-14" rowSpan={2}>
          Rk
        </th>
        {/* Channel */}
        <th className="px-2 py-2 text-center w-16" rowSpan={2}>
          Lane
        </th>
        {/* Name */}
        <th className="px-2 py-2 text-left min-w-[120px]" rowSpan={2}>
          Name
        </th>
        {/* Affiliation */}
        <th className="px-2 py-2 text-left min-w-[100px]" rowSpan={2}>
          Affiliation
        </th>
        {/* 1st Competition Stage */}
        <th className="px-1 py-1 text-center border-l border-zinc-600" colSpan={3}>
          1st Competition Stage
        </th>
        {/* 2nd Competition Stage */}
        <th className="px-1 py-1 text-center border-l border-zinc-600" colSpan={15}>
          2nd Competition Stage
        </th>
        {/* Total */}
        <th className="px-2 py-2 text-center w-20 border-l border-zinc-600" rowSpan={2}>
          Total
        </th>
        {/* Remarks */}
        <th className="px-2 py-2 text-center w-24 border-l border-zinc-600" rowSpan={2}>
          Remarks
        </th>
      </tr>
      <tr className="border-b border-zinc-700">
        <th className="px-1 py-1 text-center text-xs border-l border-zinc-600 w-14">1-5</th>
        <th className="px-1 py-1 text-center text-xs w-14">6-10</th>
        <th className="px-1 py-1 text-center text-xs w-16 bg-zinc-700/50">ST1</th>
        {Array.from({ length: 14 }, (_, i) => (
          <th key={i} className={`px-1 py-1 text-center text-xs w-10 ${i === 0 ? 'border-l border-zinc-600' : ''}`}>
            {i + 11}
          </th>
        ))}
        <th className="px-1 py-1 text-center text-xs w-16 bg-zinc-700/50">ST2</th>
      </tr>
    </thead>
  );
}
