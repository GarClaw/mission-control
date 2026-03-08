'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClientLogger } from '@/lib/client-logger'
import { MarkdownRenderer } from '@/components/markdown-renderer'

const log = createClientLogger('DocsPanel')

interface DocsTreeNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: DocsTreeNode[]
}

interface SearchResult {
  path: string
  name: string
  snippet?: string
  size?: number
  modified?: number
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function relativeTime(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}

function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'md': return '📄'
    case 'json': return '{ }'
    case 'txt': return '📝'
    case 'pdf': return '📕'
    case 'yml':
    case 'yaml': return '⚙️'
    default: return '📎'
  }
}

function TreeBrowser({
  roots,
  tree,
  selectedPath,
  onSelect,
  expanded,
  onToggle,
}: {
  roots: string[]
  tree: DocsTreeNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const renderNode = (node: DocsTreeNode, depth: number): React.ReactNode => {
    const isDir = node.type === 'directory'
    const isExpanded = expanded.has(node.path)
    const isSelected = selectedPath === node.path && !isDir

    return (
      <div key={node.path}>
        {isDir ? (
          <button
            onClick={() => onToggle(node.path)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-left text-sm transition-colors hover:bg-secondary ${
              isExpanded ? 'text-foreground' : 'text-muted-foreground'
            }`}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-4 h-4 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            >
              <polyline points="6 3 11 8 6 13" />
            </svg>
            <span>📁 {node.name}</span>
          </button>
        ) : (
          <button
            onClick={() => onSelect(node.path)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-left text-sm transition-colors ${
              isSelected
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            <span>{getFileIcon(node.path)}</span>
            <span className="flex-1 truncate">{node.name}</span>
            {node.size && (
              <span className="shrink-0 text-xs opacity-50">{formatBytes(node.size)}</span>
            )}
          </button>
        )}

        {isDir && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto space-y-2 p-3">
      {roots.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          No documentation found
        </div>
      ) : (
        tree.map((node) => renderNode(node, 0))
      )}
    </div>
  )
}

function SearchResults({
  results,
  selectedPath,
  onSelect,
}: {
  results: SearchResult[]
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="space-y-2">
      {results.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          No results found
        </div>
      ) : (
        results.map((result) => {
          const isSelected = selectedPath === result.path
          return (
            <button
              key={result.path}
              onClick={() => onSelect(result.path)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-primary/15 border-primary/30'
                  : 'bg-card border-border hover:border-primary/30 hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{getFileIcon(result.path)}</span>
                <span className="font-medium text-foreground flex-1 truncate">
                  {result.name}
                </span>
                {result.size && (
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(result.size)}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground block truncate">
                {result.path}
              </span>
              {result.snippet && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                  {result.snippet}
                </p>
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

function DocumentViewer({ path, loading }: { path: string; loading: boolean }) {
  const [content, setContent] = useState<string>('')
  const [error, setError] = useState<string>('')
  const isMarkdown_ = isMarkdown(path)

  useEffect(() => {
    if (!path) return

    setContent('')
    setError('')

    ;(async () => {
      try {
        const res = await fetch(
          `/api/docs/content?path=${encodeURIComponent(path)}`
        )
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Failed to load document')
          return
        }
        setContent(data.content || '')
      } catch (e) {
        setError(`Error loading document: ${e instanceof Error ? e.message : 'Unknown error'}`)
      }
    })()
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Loading…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-red-500 text-sm">{error}</div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No content
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      {isMarkdown_ ? (
        <div className="prose dark:prose-invert max-w-none p-6">
          <MarkdownRenderer content={content} />
        </div>
      ) : (
        <pre className="p-6 text-sm text-foreground overflow-auto max-h-full">
          {content}
        </pre>
      )}
    </div>
  )
}

export function DocsPanel() {
  const [roots, setRoots] = useState<string[]>([])
  const [tree, setTree] = useState<DocsTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [contentLoading, setContentLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'browse' | 'search'>('browse')

  // Load tree
  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/docs/tree')
      if (!res.ok) {
        log.error({ status: res.status }, 'Failed to load docs tree')
        return
      }
      const data = await res.json()
      setRoots(data.roots || [])
      setTree(data.tree || [])
      // Auto-expand first root
      if (data.roots?.length > 0) {
        setExpanded(new Set([data.roots[0]]))
      }
    } catch (e) {
      log.error({ err: e }, 'Error loading docs tree')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  // Search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      setViewMode('browse')
      return
    }

    setSearching(true)
    setViewMode('search')
    try {
      const res = await fetch(
        `/api/docs/search?${new URLSearchParams({ q: query, limit: '50' })}`
      )
      if (!res.ok) {
        log.error({ status: res.status }, 'Search failed')
        setSearchResults([])
        return
      }
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch (e) {
      log.error({ err: e }, 'Error searching docs')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const toggleExpanded = (path: string) => {
    const next = new Set(expanded)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    setExpanded(next)
  }

  const selectPath = (path: string) => {
    setSelectedPath(path)
    setContentLoading(true)
    setTimeout(() => setContentLoading(false), 100)
  }

  const fileName = selectedPath?.split('/').pop() || ''
  const fileSize = useMemo(() => {
    if (!selectedPath) return undefined
    const findNode = (nodes: DocsTreeNode[]): DocsTreeNode | undefined => {
      for (const node of nodes) {
        if (node.path === selectedPath) return node
        if (node.children) {
          const found = findNode(node.children)
          if (found) return found
        }
      }
    }
    return findNode(tree)?.size
  }, [selectedPath, tree])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0 flex-wrap gap-y-2">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search documents…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {viewMode === 'search' && (
          <button
            onClick={() => {
              setSearchQuery('')
              setSearchResults([])
              setViewMode('browse')
            }}
            className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}

        <button
          onClick={loadTree}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary"
          title="Refresh"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M13.5 8A5.5 5.5 0 112.5 5.5" />
            <path d="M2.5 2v3.5H6" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar: Browser or Search Results */}
        <div className="w-64 border-r border-border flex flex-col min-h-0 bg-muted/20">
          {viewMode === 'browse' ? (
            <>
              {roots.length > 0 && (
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0">
                  {roots.join(', ')}
                </div>
              )}
              <TreeBrowser
                roots={roots}
                tree={tree}
                selectedPath={selectedPath}
                onSelect={selectPath}
                expanded={expanded}
                onToggle={toggleExpanded}
              />
            </>
          ) : (
            <div className="flex-1 overflow-auto p-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Results ({searchResults.length})
              </div>
              <SearchResults
                results={searchResults}
                selectedPath={selectedPath}
                onSelect={selectPath}
              />
            </div>
          )}
        </div>

        {/* Main: Document Viewer */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedPath ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/20">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{getFileIcon(selectedPath)}</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {fileName}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedPath}
                    </p>
                  </div>
                </div>
                {fileSize && (
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatBytes(fileSize)}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <DocumentViewer
                  path={selectedPath}
                  loading={contentLoading}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Loading…
                </div>
              ) : (
                'Select a document to view'
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
