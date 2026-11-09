# Turns a mutation command's JSON summary into the job summary's Markdown. Usage: jq -r --arg side Frontend -f ...
def cell: gsub("\\|"; "\\|") | gsub("`"; "'") | gsub("\n"; " ");

"### \($side)\n",
"\(.files | length) source files, \(.mutants) mutants, \(.survivors | length) unnoticed, in \(.duration_seconds / 6 | round / 10) minutes (\(.duration_seconds) s).\n",
if .complete == false then
  "Stopped at the time limit with \(.mutants_tested) of \(.mutants_total) mutants tested: the rest went unchecked.\n"
else empty end,
if (.survivors | length) == 0 then
  "No mutant went unnoticed."
else
  "| File | Line | Change | Status |",
  "| --- | --- | --- | --- |",
  (.survivors[] | "| `\(.file)` | \(.line) | `\(.change | cell)` | \(.status) |")
end
