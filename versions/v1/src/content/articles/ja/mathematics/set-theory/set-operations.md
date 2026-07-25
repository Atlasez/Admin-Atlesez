---
articleId: ja-mathematics-set-operations
locale: ja
title: 集合の演算
slug: set-operations
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.set-operations
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 2つ以上の任意の集合に対して、それらから新たな集合を作り出す演算を考える。まずは、構成される集合の元が皆与えられた集合の元である場合を見る。 …
difficulty: intermediate
estimatedMinutes: 25
tags:
  - 集合の演算
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

2つ以上の任意の集合に対して、それらから新たな集合を作り出す演算を考える。まずは、構成される集合の元が皆与えられた集合の元である場合を見る。

### 和集合（合併）

任意の2つの集合$A,B$に対して、$A,B$に属する元全てをその元として持ち、それ以外の元を持たない集合が存在する(和集合の公理)。これを和集合（合併、union）と呼び、$A \cup B$と表す。すなわち、$A \cup B:=\{x \mid x \in A \text{または} x \in B\}$。

（例）$A=\{1,3,5\}, B=\{m \in \mathbb{Z} \mid m\text{は9の正の約数}\}$ に対して、$A \cup B = \{1,3,5,9\}$。

集合の族$(A_\lambda)_{\lambda\in\Lambda}$ に対しても、同様にこれらの和集合が定義され、$\bigcup_{\lambda\in\Lambda} A_\lambda$と表す。すなわち、$\bigcup_{\lambda\in\Lambda} A_\lambda:=\{x \mid \exists \lambda\in\Lambda\ \text{s.t.}\ x \in A_\lambda\}$。有限個の集合からなる集合族に対しては$\cup$の結合性から$A_1 \cup A_2 \cup \ldots \cup A_n$などとも書く。

特に$A \cap B = \varnothing$ のとき、$A \cup B$ を$A$ と$B$ の非交和（または直和）ともいい、これを$A \sqcup B$ と表す。

演算 $\cup$ は以下の性質を持つ。任意の集合$A,B,C$ に対し、

$$
A \cup B = B \cup A\text{（可換性）}
$$

$$
(A \cup B) \cup C = A \cup (B \cup C)\text{（結合性）}
$$

$$
A\cup A=A\text{（冪等性）}
$$

が成り立つ。結合性より、$\cup$の演算は括弧の順序によらず、括弧を外して$A \cup B \cup C$ と書いて良い。

### 共通部分（交差）

$A,B$両方に属する元全体からなる集合を$A$と$B$の共通部分（交差、intersection）と呼び、$A \cap B$ と表す。すなわち、$A\cap B:=\{x \in A\mid x \in B\}$。

（例）$A=\{1,4,6,8,9\}, B=\{2,4,6,8,10\}$ に対し、$A \cap B = \{4,6,8\}$。

集合の族$(A_\lambda)_{\lambda\in\Lambda}$ に対しても、同様にこれらの共通部分が定義され、$\bigcap_{\lambda\in\Lambda} A_\lambda$と表す。すなわち、$\bigcap_{\lambda\in\Lambda} A_\lambda:=\{x \mid \forall\lambda\in\Lambda\ x \in A_\lambda\}$。有限個の集合からなる集合族に対しては$\cap$の結合性から$A_1 \cap A_2 \cap \ldots \cap A_n$などとも書く。

（例）$\mathbb{N} \cap \mathbb{Q} \cap \mathbb{R} = \mathbb{N}$。

演算 $\cap$ は以下の性質をもつ。任意の集合$A,B,C$ に対し、

$$
A \cap B = B \cap A\text{（可換性）}
$$

$$
 (A \cap B) \cap C = A \cap (B \cap C)\text{（結合性）}
$$

$$
A\cap A=A\text{（冪等性）}
$$

が成り立つ。$\cap$の演算は括弧の順序によらず、括弧を外して$A \cap B \cap C$ と書いて良い。

### $\cup$と$\cap$の分配性

演算 $\cap$ と $\cup$ は分配性をもつ。つまり、任意の集合$A,B,C$ に対し、

$$
(A \cap B) \cup C = (A \cup C) \cap (B \cup C)
$$

$$
(A \cup B) \cap C = (A \cap C) \cup (B \cap C)
$$

が成り立つ。

※ $(A \cap B) \cup C \neq A \cap (B \cup C)$より、この括弧を外して$A \cap B \cup C$ と書くことはできない。

（例）$A=\{1,5,6,7\}, B=\{2,4,6,7\}, C=\{3,4,5,7\}$ のとき、 $(A \cap B) \cup C = \{3,4,5,6,7\}, \quad A \cap (B \cup C) = \{5,6,7\}$ で、これら2つは等しくない。

### 差

$A$の元全体から$B$の元であるものを除いた集合、つまり$A$に属しかつ$B$に属さない元全体からなる集合を$A$と$B$の差集合と呼び、$A\setminus B$と表す。すなわち、$A\setminus B:=\{x \in A\mid x \not\in B\}$。

### 対称差

集合$A,B$どちらか一方のみに属する元全体からなる集合を$A$ と$B$ の対称差（symmetric difference）といい、$A \triangle B$と表す。すなわち、$A \triangle B=(A\setminus B) \cup (B\setminus A)$。

### 補集合

集合$A$とその全体集合$X$に対し、全体集合のうち$A$に属さない元全体の集合を$A$の補集合（complement）と呼び、$A^c$と表す。すなわち、$A^c:=\{x \in X \mid x \notin A\}$。$(A^c)^c=A$、すなわち$A^c$ の補集合は$A$。

（例）全体集合を$\{ 正の整数全体\}$ として、その上の集合$A=\{\text{正の奇数全体}\}$ の 補集合$A^c$ は、$\{ 正の偶数全体\}$ である。

全体集合の部分集合$A,\,B$に対し、$(A\cup B)^c=A^c\cap B^c,\,(A\cap B)^c=A^c\cup B^c$が成り立つ。より一般に全体集合の部分集合の族$(A_\lambda)_{\lambda\in\Lambda}$に対し、$(\bigcup_{\lambda\in\Lambda} A_\lambda)^c=\bigcap_{\lambda\in\Lambda} {A_\lambda}^c,\,(\bigcap_{\lambda\in\Lambda} A_\lambda)^c=\bigcup_{\lambda\in\Lambda} {A_\lambda}^c$が成り立つ。これをド・モルガンの法則という。

次に、構成される集合の元が、与えられた集合の元そのものではなく、それらから作られる集合である場合を見る。

### 直積（積集合）

ある集合$X$に属する2つの元$x,y$に対して、順序付きの対$(x,y)$を考える。つまり$(x,y)=(x',y')\Leftrightarrow x=x'かつy=y'$なる対象を考える。これも集合でなければならないが、具体的に$(x,y):=\{x,\{x,y\}\}$と構成できる(対の公理)。こうして定められた順序付きの対を順序対と呼ぶ。3つ以上の元に対しても$(x_1,x_2,x_3,\ldots,x_n):=((x_1,x_2,x_3,\ldots,x_{n-1}),x_n)$と帰納的に定めることで同様の順序付きの組が定義される。これを順序組と呼ぶ。順序対は2つの元に対する順序組である。

集合$A,B$ が与えられたとき、$A$ の元$a$ と$B$ の元$b$ の順序対$(a,b)$ 全体は集合となる(置換公理)。これを$A$ と$B$ の直積や直積集合といい、$A \times B$ と表す。すなわち、$A \times B := \{(a,b) \mid a \in A \text{かつ} b \in B\}$。$A=B$ のとき、$A \times A$ を$A^2$ とも書く。

3個以上の集合に関しても同様に、$A_1$ の元$a_1$ 、$A_2$ の元$a_2$$\ldots$$A_n$ の元$a_n$ の順序組$(a_1, a_2, \ldots, a_n)$ 全体も集合となる。これを$A_1,A_2,\ldots,A_n$ の直積といい、$A_1 \times A_2 \times \ldots \times A_n$ と表す。すなわち、 $A_1 \times A_2 \times \ldots \times A_n := \{(a_1, a_2, \ldots, a_n) | a_1 \in A_1 \text{かつ} a_2 \in A_2 \text{かつ} \ldots\text{かつ} a_n \in A_n\}$。$A_1 = A_2 = \ldots= A_n =A$ のとき、これを$A^n$ とも書く。 順序対$(a_1, a_2, \ldots, a_n) \in$ に対しその$i$ 番目$a_i$ を、$(a_1, a_2, \ldots, a_n)$ の第$i$ 成分という。 $(a_1, a_2, \ldots, a_n)\in A_1 \times A_2 \times \ldots \times A_n$ に対しその第$i$ 成分$a_i \in A_i$ を定める写像 $p_i : A_1 \times A_2 \times \ldots \times A_n \rightarrow A_i$ を、第$i$ 射影という。

（例）$p_1 : A_1 \times A_2 \rightarrow A_1 ; (a_1,a_2) \mapsto a_1$
