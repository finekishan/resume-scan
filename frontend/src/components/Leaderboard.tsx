
import ExportCSVButton from './ExportCSVButton';
import { CandidateResult } from '../types';

interface LeaderboardProps {
  candidates: CandidateResult[];
  loading?: boolean;
}

import React, { useState } from 'react';

const Leaderboard: React.FC<LeaderboardProps> = ({ candidates, loading = false }) => {
  const [sortBy, setSortBy] = useState<'score' | 'name'>('score');
  const sorted = [...candidates].sort((a, b) => {
    if (sortBy === 'score') return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const topByScore = [...candidates].sort((a, b) => b.score - a.score)[0];

  if (candidates.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold">Leaderboard</h2>
          <ExportCSVButton candidates={candidates} />
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                <div className="mt-3 h-4 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                <div className="mt-2 h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                <div className="mt-4 h-10 w-2/3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-300 border border-dashed rounded-xl p-6 bg-white dark:bg-gray-900">
            Upload resumes to generate ranked candidates.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto mt-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold">Leaderboard</h2>
        <ExportCSVButton candidates={candidates} />
      </div>

      <div className="flex gap-2 mb-4">
        <button
          className={`px-3 py-1 rounded-lg border transition ${
            sortBy === 'score'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200'
          }`}
          onClick={() => setSortBy('score')}
        >
          Sort by Score
        </button>
        <button
          className={`px-3 py-1 rounded-lg border transition ${
            sortBy === 'name'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200'
          }`}
          onClick={() => setSortBy('name')}
        >
          Sort by Name
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((c, idx) => {
          const isTop = topByScore && c.name === topByScore.name && sortBy === 'score';
          const scorePct = Math.max(0, Math.min(100, c.score));

          return (
            <div
              key={`${c.name}-${idx}`}
              className={`p-5 rounded-xl border bg-white dark:bg-gray-900 shadow-sm transition ${
                isTop ? 'border-yellow-400/70' : 'border-gray-100 dark:border-gray-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                        idx === 0 && sortBy === 'score'
                          ? 'bg-yellow-400 text-yellow-900'
                          : 'bg-blue-600/10 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="font-semibold text-lg truncate">{c.name}</div>
                  </div>

                  {isTop && (
                    <div className="mt-2 inline-flex items-center px-2 py-1 rounded-md bg-yellow-400/15 text-yellow-800 dark:text-yellow-300 text-xs font-semibold">
                      Top Candidate
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className={`text-xl font-bold ${idx === 0 && sortBy === 'score' ? 'text-yellow-600 dark:text-yellow-300' : 'text-blue-600 dark:text-blue-400'}`}>
                    {c.score}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">match score</div>
                </div>
              </div>

              <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 dark:bg-blue-500" style={{ width: `${scorePct}%` }} />
              </div>

              <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{c.summary}</div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">Strengths</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{c.strengths.join(', ')}</div>
              </div>

              <div className="mt-2">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">Gaps</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{c.gaps.join(', ')}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
