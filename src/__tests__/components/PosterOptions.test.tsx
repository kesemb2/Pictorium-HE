import { describe, it, expect, vi, afterEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PosterOptions } from "@/components/PosterOptions"
import { renderWithCtx } from "@/__tests__/test-utils"
import type { TMDBImage } from "@/lib/types"

const SELECTED = { id: 7, media_type: "movie", title: "Test", poster_path: "/t.jpg" } as const

const mockPosters: TMDBImage[] = [
  { file_path: "/clean1.jpg", iso_639_1: null, vote_average: 0, width: 1000, height: 1500 },
  { file_path: "/clean2.jpg", iso_639_1: null, vote_average: 0, width: 1000, height: 1500 },
  { file_path: "/en1.jpg", iso_639_1: "en", vote_average: 0, width: 1000, height: 1500 },
  { file_path: "/it1.jpg", iso_639_1: "it", vote_average: 0, width: 1000, height: 1500 },
]

describe("PosterOptions", () => {
  it("shows loading when no posters", () => {
    renderWithCtx(<PosterOptions posters={[]} posterActivePath={null} lang="it" selectPoster={() => {}} />)
    expect(screen.getAllByText("ui.loading").length).toBeGreaterThan(0)
  })

  it("shows only the clean pool when there are clean posters", () => {
    const { container } = renderWithCtx(<PosterOptions posters={mockPosters} posterActivePath={null} lang="it" selectPoster={() => {}} />)
    // Una sola tab (il pool) non si disegna: la griglia è il pool.
    expect(container.querySelectorAll(".tab-chip")).toHaveLength(0)
    expect(container.querySelectorAll("img")).toHaveLength(2)
    // Le lingue servono solo quando non c'è nessun clean.
    expect(screen.queryByText(/Italiano/)).toBeNull()
    expect(screen.queryByText(/English/)).toBeNull()
  })

  it("falls back to the language tabs when there is no clean poster, never showing \"und\"", async () => {
    const u = userEvent.setup()
    const noClean = [
      ...mockPosters.filter((p) => p.iso_639_1 !== null),
      { file_path: "/rejected.jpg", iso_639_1: "und", vote_average: 0, width: 1000, height: 1500 },
    ]
    const { container } = renderWithCtx(<PosterOptions posters={noClean} posterActivePath={null} lang="it" selectPoster={() => {}} />)
    const itTab = screen.getByText(/Italiano/)
    expect(screen.getByText(/English/)).toBeInTheDocument()
    await u.click(itTab)
    expect(itTab.closest("button")).toHaveClass("tab-chip-active")
    expect(container.querySelector("img[src*='rejected']")).toBeNull()
    expect(screen.queryByText(/^und/)).toBeNull()
  })

  it("showTabs=false hides tabs", () => {
    renderWithCtx(<PosterOptions posters={mockPosters} posterActivePath={null} lang="it" selectPoster={() => {}} showTabs={false} />)
    expect(screen.queryByText(/Clean/)).not.toBeInTheDocument()
  })

  it("renders clean poster images with correct src", () => {
    const { container } = renderWithCtx(<PosterOptions posters={mockPosters} posterActivePath={null} lang="it" selectPoster={() => {}} />)
    const imgs = container.querySelectorAll("img")
    const cleanSrcs = mockPosters.filter((p) => p.iso_639_1 === null).map((p) =>
      `https://image.tmdb.org/t/p/w154${p.file_path}`
    )
    cleanSrcs.forEach((src) => {
      const match = Array.from(imgs).some((img) => img.getAttribute("src") === src)
      expect(match).toBeTruthy()
    })
  })

  it("renders session custom tiles first with a remove button, saved tile without", async () => {
    const u = userEvent.setup()
    const onRemove = vi.fn()
    const sessionTile: TMDBImage = { file_path: "https://i.imgur.com/session.jpg", iso_639_1: null, vote_average: 0, width: 1000, height: 1500 }
    const savedTile: TMDBImage = { file_path: "https://i.imgur.com/saved.jpg", iso_639_1: null, vote_average: 0, width: 0, height: 0 }
    const { container } = renderWithCtx(
      <PosterOptions
        posters={mockPosters}
        posterActivePath={null}
        lang="it"
        selectPoster={() => {}}
        customPosters={[sessionTile]}
        savedCustomPoster={savedTile}
        onRemoveCustomPoster={onRemove}
      />,
    )
    const imgs = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"))
    // Tile custom primi in griglia, thumb diretta (niente proxy)
    expect(imgs[0]).toBe("https://i.imgur.com/session.jpg")
    expect(imgs[1]).toBe("https://i.imgur.com/saved.jpg")
    // Una sola × (tile di sessione); il salvato non ne ha
    const removeBtns = screen.getAllByRole("button", { name: "ui.remove" })
    expect(removeBtns).toHaveLength(1)
    await u.click(removeBtns[0])
    expect(onRemove).toHaveBeenCalledWith("https://i.imgur.com/session.jpg")
  })

  it("no remove button without handler", () => {
    const sessionTile: TMDBImage = { file_path: "https://i.imgur.com/session.jpg", iso_639_1: null, vote_average: 0, width: 1000, height: 1500 }
    renderWithCtx(
      <PosterOptions posters={mockPosters} posterActivePath={null} lang="it" selectPoster={() => {}} customPosters={[sessionTile]} />,
    )
    expect(screen.queryByRole("button", { name: "ui.remove" })).toBeNull()
  })

  it("puts verified fanart and TVDB posters in the clean pool with a source chip", async () => {
    const u = userEvent.setup()
    const selectPoster = vi.fn()
    const fanart: TMDBImage = { file_path: "https://assets.fanart.tv/fanart/movies/7/movieposter/b.jpg", iso_639_1: null, vote_average: 3, width: 0, height: 0, source: "fanart" }
    const tvdb: TMDBImage = { file_path: "https://artworks.thetvdb.com/banners/v4/movie/7/posters/c.jpg", iso_639_1: null, vote_average: 1, width: 0, height: 0, source: "tvdb" }
    const rejected: TMDBImage = { file_path: "https://assets.fanart.tv/fanart/movies/7/movieposter/t.jpg", iso_639_1: "und", vote_average: 9, width: 0, height: 0, source: "fanart" }
    const { container } = renderWithCtx(
      <PosterOptions posters={[...mockPosters, fanart, tvdb, rejected]} posterActivePath={null} lang="it" selectPoster={selectPoster} />,
      { selected: { ...SELECTED, media_type: "movie" } },
    )
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"))
    expect(srcs).toContain(fanart.file_path)
    expect(srcs).toContain(tvdb.file_path)
    expect(srcs).not.toContain(rejected.file_path)
    const chips = screen.getAllByTestId("poster-source").map((c) => c.textContent)
    expect(chips).toEqual(["TMDB", "TMDB", "Fanart", "TVDB"])
    // Niente più tab Fanart.tv separata: è nel pool.
    expect(screen.queryByRole("button", { name: "ui.fanartTitle" })).toBeNull()
    const tile = container.querySelector(`img[src="${tvdb.file_path}"]`)!.closest("button")!
    await u.click(tile)
    expect(selectPoster).toHaveBeenCalledWith(expect.objectContaining({ file_path: tvdb.file_path, iso_639_1: null }))
  })

  it("shows a saved custom base that is also in the pool only once", () => {
    const fanart: TMDBImage = { file_path: "https://assets.fanart.tv/fanart/movies/7/movieposter/b.jpg", iso_639_1: null, vote_average: 3, width: 0, height: 0, source: "fanart" }
    const { container } = renderWithCtx(
      <PosterOptions posters={[...mockPosters, fanart]} posterActivePath={null} lang="it" selectPoster={() => {}} savedCustomPoster={{ ...fanart, source: undefined }} />,
    )
    expect(container.querySelectorAll(`img[src="${fanart.file_path}"]`)).toHaveLength(1)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
