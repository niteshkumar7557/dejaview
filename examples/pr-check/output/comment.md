<!-- dejaview -->

**📜 DejaView check — 3 past decisions touch this code or proposal**

Historical context is informational; it does not automatically reject this pull request.

### Related accepted architectural decisions

**[PEP 698 · ACCEPTED: Accepted proposals: providing a TYPE\_CHECKING shim for third\-party decorators and adopting the main @typing\.override decorator](<http://localhost:3100/decisions/9>)**
Why: One way of handling this kind of thing is to do a typing\.TYPE\_CHECKING shim, like so: from typing import TYPE\_CHECKING if TYPE\_CHECKING: from typing import override as override else: def override\(func\):; The SC has decided to accept this PEP\!
Linked via: `Lib/typing.py`
Evidence and source links: [view decision](<http://localhost:3100/decisions/9>)

### Previously rejected similar proposals

⚠️ This looks similar to a **previously rejected idea**: “Rejecting built\-in runtime enforcement or parent\-class specification due to low utility and library\-level implementability” (PEP 698). Reason: if in a single commit you move a method from one base to another, you as the author are likely aware of what you did, so the safety benefits are relatively small; I'm guessing there wouldn't be too much use of this feature\. Since it's relatively easy to implement this capability using runtime logic in a library, that makes me thing we don't need to bake it into typing\.py all of the type checkers\.
[View source discussion and decision](<http://localhost:3100/decisions/7>)

⚠️ This looks similar to a **previously rejected idea**: “Requiring the decorator specifically for abstract method overrides \(rejected in favor of a strict mode option\)” (PEP 698). Reason: I'm not sure there is much need for special treatment of abstract methods\. The PEP recommends type checkers support a strict mode where all method overrides must be marked with the decorator, whether abstract or not\.
[View source discussion and decision](<http://localhost:3100/decisions/8>)

[Open the DejaView dashboard](<http://localhost:3100/>)
