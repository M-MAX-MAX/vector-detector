import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export interface AnalysisResult {
  id: string;
  fileName: string;
  fileType: string;
  verdict: 'True Vector' | 'Raster in Vector Container' | 'Mixed Content';
  explanation: string;
  fileSize: number;
  uploadTime: Date;
  hasVectorElements: boolean;
  hasRasterElements: boolean;
}

type SortKey = 'fileName' | 'verdict' | 'fileSize' | 'uploadTime' | 'fileType';
type SortOrder = 'asc' | 'desc';

interface ResultsTableProps {
  results: AnalysisResult[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

const verdictColors: Record<string, { bg: string; text: string; badge: string }> = {
  'True Vector': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  'Raster in Vector Container': {
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    badge: 'bg-amber-100 text-amber-800',
  },
  'Mixed Content': {
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    badge: 'bg-blue-100 text-blue-800',
  },
};

export default function ResultsTable({ results, onDelete, onClearAll }: ResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('uploadTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterVerdict, setFilterVerdict] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sortedAndFilteredResults = useMemo(() => {
    let filtered = results;

    if (filterVerdict) {
      filtered = filtered.filter(r => r.verdict === filterVerdict);
    }

    return filtered.sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      if (sortKey === 'fileSize') {
        aVal = a.fileSize;
        bVal = b.fileSize;
      } else if (sortKey === 'uploadTime') {
        aVal = new Date(a.uploadTime).getTime();
        bVal = new Date(b.uploadTime).getTime();
      } else if (sortKey === 'verdict') {
        const verdictOrder = {
          'True Vector': 0,
          'Mixed Content': 1,
          'Raster in Vector Container': 2,
        };
        aVal = verdictOrder[a.verdict as keyof typeof verdictOrder];
        bVal = verdictOrder[b.verdict as keyof typeof verdictOrder];
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, sortKey, sortOrder, filterVerdict]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedAndFilteredResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAndFilteredResults.map(r => r.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleExportSelected = () => {
    const toExport = sortedAndFilteredResults.filter(r => selectedIds.has(r.id));
    if (toExport.length === 0) {
      toast.error('Please select files to export');
      return;
    }

    const csv = [
      ['Filename', 'File Type', 'Verdict', 'File Size', 'Upload Time', 'Explanation'],
      ...toExport.map(r => [
        r.fileName,
        r.fileType,
        r.verdict,
        formatFileSize(r.fileSize),
        formatDate(r.uploadTime),
        r.explanation,
      ]),
    ]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vector-detector-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${toExport.length} result(s)`);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <div className="w-4 h-4" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  if (results.length === 0) {
    return null;
  }

  const uniqueVerdicts = Array.from(new Set(results.map(r => r.verdict)));

  return (
    <Card className="mt-8 p-6 border border-gray-200">
      <div className="space-y-4">
        {/* Header with title and actions */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Analysis Results</h2>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportSelected}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export ({selectedIds.size})
              </Button>
            )}
            {results.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={onClearAll}
                className="flex items-center gap-2 text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filterVerdict === null ? 'default' : 'outline'}
            onClick={() => setFilterVerdict(null)}
            className="text-xs"
          >
            All ({results.length})
          </Button>
          {uniqueVerdicts.map(verdict => {
            const count = results.filter(r => r.verdict === verdict).length;
            return (
              <Button
                key={verdict}
                size="sm"
                variant={filterVerdict === verdict ? 'default' : 'outline'}
                onClick={() => setFilterVerdict(verdict)}
                className="text-xs"
              >
                {verdict} ({count})
              </Button>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      sortedAndFilteredResults.length > 0 &&
                      selectedIds.size === sortedAndFilteredResults.length
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('fileName')}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    Filename
                    <SortIcon column="fileName" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('fileType')}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    Type
                    <SortIcon column="fileType" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('verdict')}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    Verdict
                    <SortIcon column="verdict" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('fileSize')}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    Size
                    <SortIcon column="fileSize" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('uploadTime')}
                >
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    Upload Time
                    <SortIcon column="uploadTime" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredResults.map(result => {
                const colors = verdictColors[result.verdict];
                return (
                  <tr
                    key={result.id}
                    className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${colors.bg}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(result.id)}
                        onChange={() => handleToggleSelect(result.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                      {result.fileName}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{result.fileType}</td>
                    <td className="px-4 py-3">
                      <Badge className={colors.badge}>{result.verdict}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatFileSize(result.fileSize)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {formatDate(result.uploadTime)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(result.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state for filtered results */}
        {sortedAndFilteredResults.length === 0 && results.length > 0 && (
          <div className="text-center py-8 text-gray-500">
            No results match the selected filter.
          </div>
        )}
      </div>
    </Card>
  );
}
