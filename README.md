# Berklee ESL

Student-facing companion site for Prof. Kramer Gibson's ESL sections at Berklee
College of Music. Plain HTML and CSS, no build step, served by GitHub Pages.

Live at <https://kramermusician.github.io/berklee-esl/>

The name is deliberately semester-free. Each fall and spring adds content, it
does not add a repo. The Summer 2026 ESL1 site lives on unchanged at
<https://kramermusician.github.io/esl1-summer-2026/> and is linked from the
landing page as an archive, so any bookmark a former student has still resolves.

## Structure

```
index.html                  landing page, pick a section
about.html                  About Prof. Gibson, shared by both sections
kramer-bio.jpg              portrait used on about.html
assets/site.css             one stylesheet for every page
esl1/
  index.html                ESL1 hub
  welcome-essay.pdf
esl3/
  index.html                ESL3 hub
  welcome-essay.pdf
shared/
  song-study/               worksheets both sections use
tools/
  cabinet/                  Stuff to Track, a localStorage filing cabinet
  timeline-maker/           Timeline Maker, photos and dates on a shaped line
```

## Adding material

Course handouts go in the section folder that owns them, then get a card in that
section's `index.html`. Anything both sections use goes under `shared/` and gets
a card in all three index pages. The card markup is a copy-paste block:

```html
<li>
  <a href="path/to/file.pdf">
    <div class="week-num">Week 4 · Sep 21 to Sep 27</div>
    <div class="week-title">Short title</div>
    <div class="week-desc">One sentence on what it is and when we use it.</div>
  </a>
</li>
```

For something announced but not yet posted, use the pending variant, which
renders dashed and greyed with no link:

```html
<li class="pending">
  <div>
    <div class="week-num">Coming soon</div>
    <div class="week-title">Short title</div>
    <div class="week-desc">One sentence.</div>
  </div>
</li>
```

## Run locally

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy

Pushing to `main` publishes. Pages is configured as deploy-from-branch,
`main` at root.

## Dashboard link

The Teaching Dashboard reads each course's `siteUrl` from
`knowledge/Berklee Courses/course-schedules/fall-2026.json`. Changing where a
course site lives is a JSON edit, not a code change.

## Voice

Student-facing copy on this site follows the Kramer Voice SOP. Short, direct,
conversational, second person. No corporate phrasing, no bold, no em dashes.
New copy gets a voice pass before it ships.
