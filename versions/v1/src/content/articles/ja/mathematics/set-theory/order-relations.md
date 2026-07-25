---
articleId: ja-mathematics-order-relations
locale: ja
title: 順序関係
slug: order-relations
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.order-relations
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 順序の定義 定義 1 (順序の定義). 上の二項関係であって、推移的かつ反射的であるものを前順序といい、 で表す。反対称的な前順序を半順序という。 …
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 順序関係
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 順序の定義

定義 1 (順序の定義). $X$上の二項関係であって、推移的かつ反射的であるものを前順序といい、$\leq$で表す。反対称的な前順序を半順序という。$(X,\leq)$をそれぞれ前順序集合や半順序集合などという。

$X$に定められた順序が文脈上明らかで誤解が生じない場合は,単に順序集合$X$と言うこともある.

命題 2. 前順序集合$(X,\leq)$に対して、$a\sim b\iff (a\leq b\land b\leq a)$によって同値関係を定め、この同値関係による商集合における順序を$[x]\leq^\prime[y]\iff x\leq y$によって定めれば、$(X/\sim,\leq^\prime)$は半順序集合となる。

証明. まず$\sim$が同値関係であることを示す。 反射性は前順序の反射性より $a\le a$ なので $a\sim a$。 対称性は$\sim$の定義より従う。 推移性は、$a\sim b$かつ$b\sim c$のとき $a\le b\le c$および $c\le b\le a$ から $a\le c$かつ$c\le a$、よって $a\sim c$。

次に$\le'$が well-defined であることを示す。 $[x]=[x']$かつ$[y]=[y']$とし、$x\le y$を仮定する。 $[x]=[x']$より $x'\le x$、$[y]=[y']$より $y\le y'$。 したがって推移性より $x'\le x\le y\le y'$ であり $x'\le y'$ を得る。 ゆえに代表元の取り方によらず $[x]\le'[y]$ は定まる。

最後に$\le'$が半順序であることを示す。 任意の$[x]$について $x\le x$ より $[x]\le'[x]$より反射的である。 $[x]\le'[y]$かつ$[y]\le'[z]$ならば $x\le y$かつ$y\le z$なので $x\le z$、よって $[x]\le'[z]$となり推移的である。 $[x]\le'[y]$かつ$[y]\le'[x]$ならば $x\le y$かつ$y\le x$、すなわち $x\sim y$。よって $[x]=[y]$ であるのでより反対称的である。

以上より、$(X/\sim,\le')$は半順序集合である。 ◻

### 鎖・反鎖

定義 3 (比較可能). 前順序集合$P$の2元$x,y\in P$に対し、

$$
(x\leq y)\lor(y\leq x)
$$

が真であるとき$x$と$y$は比較可能であるといい、比較可能でないとき、すなわち

$$
(x\not\leq y)\land(y\not\leq x)
$$

が真であるとき$x$と$y$は比較不能であるという。

定義 4 (鎖・反鎖). 前順序集合$P$の部分集合$A$であって、任意の2元$x,y\in A$が比較可能であるとき、$A$を$P$の鎖という。また任意の2元$x,y\in A$が比較不能であるとき、$A$を$P$の反鎖という。

定義 5 (順序集合の長さ・幅). 前順序集合$P$に対し、その鎖の濃度の上限を$P$の長さという。また反鎖の濃度の上限を$P$の幅という。

順序集合の大きさが有限の場合は鎖や反鎖の濃度には最大値が存在して、それらは上の定義と一致する。

### 全順序

定義 6 (全順序律). 任意の2元が比較可能であるという条件

$$
\forall a,b\in X (a\leq b\lor b\leq a)
$$

を全順序律という。全順序律を満たす前順序を全前順序という。全順序律を満たす半順序を全順序あるいは線形順序という。

### 逆順序・狭義順序

定義 7 (逆順序). 順序$\leq$の逆関係を逆順序や双対順序といい、$\geq$で表す。$(X,\geq)$を双対順序集合などという。

定義 8 (狭義順序). それぞれの順序から恒等関係を除いた関係 $<=\leq\setminus\{(x,x)\mid x\in X\}$ を狭義順序という。$\leq$の性質に応じて狭義前順序や狭義半順序などという。狭義でない順序の逆順序の補関係とも言い換えられる。

これはすなわち狭義でない順序の定義における反射性を非反射性に取り替えたものである。

---

©2025 Atlasez
