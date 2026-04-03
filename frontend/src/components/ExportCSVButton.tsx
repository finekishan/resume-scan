import React from 'react';
import { CandidateResult } from '../types';

function toCSV(rows: string[][]) {
  return rows.map(row => row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\n');
}

const ExportCSVButton: React.FC<{ candidates: CandidateResult[] }> = ({ candidates }) => {
  const handleExport = () => {
    const header = ['Name', 'Score', 'Strengths', 'Gaps', 'Summary'];
    const rows = candidates.map(c => [
      c.name,
      c.score.toString(),
      c.strengths.join('; '),
      c.gaps.join('; '),
      c.summary
    ]);
    const csv = toCSV([header, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'candidates.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
      onClick={handleExport}
      disabled={candidates.length === 0}
    >
      Export as CSV
    </button>
  );
};

export default ExportCSVButton;
