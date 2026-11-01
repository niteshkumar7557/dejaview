# We had this debate before. Nobody wrote it down.

**Team Sipmap — Hacktoberfest Hack Day Sonipat, 31 Oct–1 Nov 2025**
Problem 06: Open Source Decision Intelligence and Knowledge Recovery

---

## Orientation, main auditorium

It started in the main auditorium, everybody in the room, a projector at the front, and the
organisers walking the problems out one by one. Problem six landed on the screen:

> *Build a system that reads old discussions and recovers the decisions that were made in them.*

Twelve hours. Four of us. We said yes before the slide was even finished being read. And the
first thing we did afterwards was exactly what you'd expect from four engineers who each
happened to be carrying their own laptop: we spread out, opened them, and did the ideation on
our own screens. Four laptops, four sets of notes, one argument we kept coming back to.

The brainstorming was loud and fast and half of it was nonsense, and we knew that at the time.
Somewhere in the middle of it, someone said the phrase that decided our night: **"you've had
this debate before."**

Think about a chess game. A good player doesn't just remember who won. They remember the moves
that *almost* worked, the gambits that were refuted, the positions that looked winning until the
opponent found the one reply that killed them. That memory is the whole difference between a
hobbyist and a master.

Python has a version of this. PEP 572 gave us the walrus operator. Somebody proposed spelling it
`x as y`. It was rejected, because `as` already means different things in `import`, in `with` and
in `except`. That reasoning exists only in a discussion thread that heated up so badly that
Guido stepped down as BDFL afterwards. The reasoning was never written down anywhere that a
newcomer would find it.

So a newcomer joins the project, proposes `x as y`, and gets told "no, we tried that". The
conversation happens a third time. A fourth. Nobody is being malicious. The reasoning was in
someone's head and then it wasn't, because that person left.

We named the thing we built **DejaView**. Twelve hours later it reads a Python PEP discussion and
hands back the ideas that were rejected, the reason each one died, and the exact post where
somebody said it.

## Four boards, one contract

The first real decision was not technical. We had twelve hours and four people, and every
integration point was a place to lose an hour to a merge conflict. So we split the board the way
you split a chess opening: each of us took a quarter, and we wrote down the **contract** first,
so nobody had to wait on anybody else's code.

- **Mudit** took the backbone. Getting discussions in, storing everything in Postgres with raw
  SQL, the job queue, the API, deployment.
- **Abhijeet** took the model. The LLM client, the funnel that decides what the model reads, the
  quote verifier, the self-evaluation.
- **Ansh** took the code linking. Finding the file a decision is about, surviving renames, the
  GitHub Action that comments on pull requests.
- **Nitesh** took the screen. The dashboard, and the pitch.

We agreed on folder ownership, and the rule that turned out to matter most was: **if you need a
change in someone else's folder, you don't make it. You write down what you need and you ask.**
Not because we didn't trust each other. Because at 3 AM, a surprise diff in a file you don't own
is how you lose an hour.

## The bug that taught us the most

An hour in, we called the forum's API for a thread and got back a successful response with an
empty list of posts. No error. Status 200. Just nothing.

It turned out the API has two ids for every post: a global one and a "post number" that humans
see in the URL. Pass the wrong one and it doesn't complain. It just returns `posts: []`.

That was our first real lesson and it set the tone for the whole night: **the worst bugs are the
ones that report success.** A crashed program is a gift. So we wrote a test that asserts we ask
for the global id and specifically *do not* ask for the post number. That test exists so the next
person doesn't rediscover the silence at 4 AM.

The same night we found the forum doesn't have a `like_count` field. Likes live in an
`actions_summary` array. And a pull request body can be `null` — not empty, `null`. Every reader
of that field now goes through `?? ""`. None of this is in the design document. You only learn it
by calling the API and printing what comes back.

## Two models, and why

We only get one laptop with 4 GB of VRAM, so we couldn't afford to be careless with the model.
The pipeline is a funnel:

1. **Cheap code first.** Strip quoted text, drop "+1" and "thanks", score each post for
   decision-signal. No model involved. Hundreds of posts down to about a hundred.
2. **The small model sorts.** Qwen3.5 4B labels each post: proposal, alternative, objection,
   support, decision, question, noise. This is simple classification across many posts, so speed
   matters more than depth.
3. **The big model reasons.** Qwen3.5 9B reads only the posts that survived, and returns
   structured JSON: a title, a status, the reasons, and a verbatim quote for every reason.
4. **Code checks, not the model.** We normalize whitespace and fuzzy-match every quote against
   the post it came from. Exact match scores 1.0. Above 0.85 it's verified. Below that it's
   flagged yellow and never quietly dropped.
5. **The big model merges.** Duplicate ideas from different chunks get consolidated into one
   record.

The small model sorts, the big model thinks, and **code decides whether we're allowed to claim
something**. That last part is our answer to "how do you stop a 4B model from hallucinating?" We
don't trust it. We check it.

Because the model is slow and the organizers' machines have no API keys, every model call is
cached by prompt hash and recorded. Tests replay the recorded answers. CI is green with no
network and no GPU.

## The night we kept losing

The tests taught us more than the code did.

At one point six tests failed that had passed individually. Vitest runs test files in parallel,
and each of our database test files started by deleting all the rows. They were deleting each
other's data while they ran. The fix was to give every test file its own Postgres schema, so two
files can hold two sets of tables with the same names side by side. Now the suite runs in three
seconds and nobody fights.

Other things that broke, and what they taught:

- **Every GitHub ingest started failing with 403.** We'd been hitting the unauthenticated rate
  limit, 60 requests an hour. The token existed in the environment. We just weren't sending it to
  the ingest step. One line of code, half an hour of confusion.
- **The 9B model returned `"evidence": []` for every single reason** — and then copied the quote
  into the reason text anyway. Every decision had lost its quote, its people, its code link. Now,
  when a reason has no evidence, we check whether its own text appears word for word in a post
  the model read, and treat that as the quote.
- **A `functools.cache` pull request got matched to a PEP 701 f-string decision with ten
  reasons**, and the comment was a wall of unrelated text. We were ranking similar rejected ideas
  by how many words they shared, and a long decision shares a few everyday words with almost
  anything. Now matches are scored by shared words over the square root of the decision's length,
  and weak ones are dropped.
- **At 05:20 we found the health endpoint telling us the database was down** while the database
  was right there. It was asking for a table by its full name in one specific schema, so it said
  "no" anywhere else. One word changed.

And the one that still stings: **our evaluation judge rejected its own correct answer.** We asked
the model which recovered idea matched the PEP's "Runtime enforcement" item, and it said *none of
them*, while candidate one was titled "Rejecting built-in runtime enforcement or parent-class
specification". The decision was right. Its summary just described the other half of it. The
number on our scorecard was wrong because of a one-line summary, not because the extraction
failed.

We didn't have time to rebuild the judge properly before the freeze. So we wrote down exactly
what was wrong, in the place where the next person will look, and left the number visible
instead of hiding it.

## What testing felt like

People ask what it looks like to test twelve hours of work. It looks like this:

```
npm run typecheck    → green in 8 workspaces
npm test             → 460 tests, 50 files
npm test             → again, because you changed one string
npm test             → again, because you were not sure
```

That's it. That's the whole trick. The pipeline is deterministic once the model answers are
recorded, so the test suite becomes this little machine you can lean on. When something breaks at
2 AM you don't have to guess. You change one thing, you run 460 tests, you find out.

We also refused to cheat in a way that would have been easy. The task says: given the discussion
*without* the PEP, recover the rejected ideas. So the extraction path never reads the PEP. Only
the evaluation module fetches it, afterwards, to score us. We traced every path to be sure,
including the cache, because the cache key is a hash of the prompt and an evaluation prompt
contains the PEP. It can't leak into extraction. We checked, and then we checked the tests that
check it.

## 6:29 AM

At half past six in the morning we pushed the last commit and the repo was frozen.

What we had: a system that takes a 114-post PEP discussion and gives back 16 decisions with 58
reasons, every one of them tied to a quote we checked and a post you can click. A dashboard. A
pull-request bot that says *"we tried this in 2022 and here's why it didn't work"*. A scorecard
that puts our answer next to the real PEP's and tells us where we were wrong.

What we didn't have: a deployment, a judge we trusted, and enough sleep.

The thing I'd tell the next team: the interesting part isn't the model. Anyone can call a model.
The interesting part is the boring, defensive layer around it. The empty response that didn't
error. The quote that was almost right. The schema that wasn't the one you thought. Twelve hours
is not a lot of time to build a thinking machine. It's plenty of time to build a machine that
*checks* its thinking, and that's the part we'd want to keep.

---

*Built by Team Sipmap — Mudit Agrawal, Nitesh Kumar, Abhijeet Raj Singh, Ansh Gupta.
Models: Qwen3.5 9B and Qwen3.5 4B, open-weight, run locally with Ollama. No closed APIs.
MIT licensed.*
