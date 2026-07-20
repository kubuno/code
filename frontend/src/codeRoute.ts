// The open project is client-side state rather than a route of its own, but it
// still deserves a real, shareable link: the sidebar rows are anchors carrying
// `/code?project=<id>`. CodeApp reads the value back, so a pasted link, a reload
// and the browser Back button all restore the right project.
//
// A query string is used rather than a hash because CodeApp already owns the
// search params (it receives `from_files_id` from the drive module).

/** `to=` value for a project row. */
export function codeTo(projectId: string): string {
  return `/code?project=${encodeURIComponent(projectId)}`
}

/** Project id carried by a location search string, or null. */
export function projectFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('project')
}
