import { ChevronRight } from "lucide-react"

interface Props {
  path: { id: string | null; name: string }[]
  onNavigate: (folderId: string | null) => void
}

export function FolderBreadcrumb({ path, onNavigate }: Props) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {path.map((item, i) => (
        <span key={item.id ?? "root"} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <button
            onClick={() => onNavigate(item.id)}
            className={`hover:underline ${i === path.length - 1 ? "font-medium" : "text-muted-foreground"}`}
          >
            {item.name}
          </button>
        </span>
      ))}
    </nav>
  )
}
