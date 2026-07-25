---
articleId: ja-mathematics-modules
locale: ja
title: 環上の加群の定義
slug: modules
subject: mathematics
category: module-theory
concepts:
  - id: math.module-theory.modules
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  左加群の定義 定義 1 (左R加群) を単位的環とする. 集合 と の組 が以下の条件を満たすとき, を 左 加群と呼ぶ.
  が可換群であるとは, 以下の条件を満たすことをいう. - (二項演算の閉性) 上の閉じた二項演算…
difficulty: intermediate
estimatedMinutes: 45
tags:
  - 環上の加群の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 左加群の定義

定義 1 (左R加群) $R$を単位的環とする. 集合$M$と$R$ の組$((M, +_{\small M}, 0_{\small M}, -_{\small M}), (R, +_{\small R},0,-_{\small R}, \cdot_{\small R}, 1_{\small R}), . \ )$ が以下の条件を満たすとき, $M$ を 左$R$加群と呼ぶ.

$(M, +_{\small M}, 0_{\small M}, -_{\small M})$ が可換群であるとは, 以下の条件を満たすことをいう.

- (二項演算の閉性) $M$ 上の閉じた二項演算（加法）$+_{\small M} : M \times M \to M$ が定まっている.

- (加法の結合法則) $x, y, z \in M$ に対し, $(x +_{\small M} y) +_{\small M} z = x +_{\small M} (y +_{\small M} z)$.

- (単位元の存在) ある $0_{\small M} \in M$ が存在して, $\forall x \in M, \ 0_{\small M} +_{\small M} x = x$. この $0_{\small M}$ を $M$ の 零元 という.

- (加法逆元の存在) 各 $x \in M$ にその加法逆元を与える単項演算 $-_{\small M} : M \to M$ が定まっていて, 任意の $x \in M$ に対し, $(-_{\small M} x) +_{\small M} x = 0_{\small M}$ を満たす. この $-_{\small M} x$ を $x$ の 逆元 という.

- (加法の可換性) $\forall x, y \in M, \ x +_{\small M} y = y +_{\small M} x$.

$(R, +_{\small R},0,-_{\small R}, \cdot_{\small R}, 1_{\small R})$ が単位的環であるとは, 以下の条件を満たすことをいう.

- (二項演算の閉性) $R$上の閉じた二項演算$+_{\small R}\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall a,b,c\in R, (a+_{\small R}b)+_{\small R}c=a+_{\small R}(b+_{\small R}c) \end{align*}
$$

- (零元の存在)加法単位元$0_{\small R}\in R$が存在して

$$
\begin{align*} \forall a\in R,\quad a+_{\small R}0_{\small R}=a \end{align*}
$$

- (加法逆元の存在)$R$上の閉じた単項演算$-_{\small R}\colon R\to R;\ a\mapsto -_{\small R}a$が存在して

$$
\begin{align*} \forall a\in R,\quad a+_{\small R}(-_{\small R}a)=0_{\small R} \end{align*}
$$

- (加法の可換性)次の加法に関する交換法則が成り立つ.

$$
\begin{align*} \forall a,b\in R,\quad a+_{\small R}b=b+_{\small R}a \end{align*}
$$

- $R$上の閉じた二項演算$\cdot_{\small R}\;\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall a,b,c\in R,\quad (a\cdot_{\small R} b)\cdot_{\small R} c=a\cdot_{\small R} (b\cdot_{\small R} c) \end{align*}
$$

- (乗法単位元の存在)乗法単位元$1_{\small R}\in R$が存在して

$$
\begin{align*} \forall a\in R,\quad a\cdot_{\small R}1_{\small R}=1_{\small R}\cdot_{\small R} a=a \end{align*}
$$

乗法$\cdot_{\small R}\;\colon R\times R\to R$は双加法的である. すなわち以下が成り立つ.

- (左分配法則) 各 $a \in R$ に対し, 左乗法写像 $R \to R \ (b \mapsto a \cdot_{\small R} b)$ は加法群 $(R, +_{\small R}, 0_{\small R}, -_{\small R})$ の準同型である. すなわち

$$
\begin{align*} \forall a, b, c \in R,\ a\cdot_{\small R}(b +_{\small R} c) = a\cdot_{\small R} b +_{\small R} a\cdot_{\small R} c \end{align*}
$$

- (右分配法則) 各 $c \in R$ に対し, 右乗法写像 $R \to R \ (b \mapsto b \cdot_{\small R} c)$ は加法群 $(R, +_{\small R}, 0_{\small R}, -_{\small R})$ の準同型である. すなわち

$$
\begin{align*} \forall a, b, c \in R,\ (a +_{\small R} b)\cdot_{\small R} c = a\cdot_{\small R} c +_{\small R} b\cdot_{\small R} c \end{align*}
$$

写像 $\mathbin{.}: R \times M \to M$ が単位的環作用であるということは以下の条件を満たすことをいう.

- $\forall a, b \in R, \ \forall x \in M$ に対し, $(a \cdot_{\small R} b).x = a.(b.x)$

- 環 $R$ の乗法単位元 $1_{\small R}$ に対し, $\forall x \in M, \ 1_{\small R}.x = x$

- $\forall a, b \in R, \ \forall x \in M$ に対し, $(a +_{\small R} b).x = a.x +_{\small M} b.x$

- $\forall a \in R, \ \forall x, y \in M$ に対し, $a.(x +_{\small M} y) = a.x +_{\small M} a.y$

混同の恐れがない限り, 左$R$加群を定義する組$((M, +_{\small M}, 0_{\small M}, -_{\small M}), (R, +_{\small R},0,-_R, \cdot_{\small R}, 1_{\small R}), . \ )$は, 単にその台集合$M$または係数体との組$(M,R)$として表記される. また, 係数環が文脈上明らかなときは単に加群$M$ということもある. これに伴い, $M$における加法$\mathbin{+_M}$および$R$における加法$\mathbin{+_R}$は, 演算の対象によって数学的な意味が一意に定まるため, いずれも単に$+$で表す. また, 左作用$R\times M\to M$を表す記法も簡略化され, $a.x$は単に$ax$と表記される.

### 右加群と両側加群の定義

左加群を左作用を持つ加群として定義したのと同様に, 右作用を持つ加群として右加群が定義される. また, 両側加群とは左右両方の作用をもつ加群のことである.

定義 2 (右R加群) $R$を単位的環とする. 集合$M$と$R$ の組$((M, +_{\small M}, 0_{\small M}, -_{\small M}), (R, +_{\small R},0,-_R, \cdot_{\small R}, 1_{\small R}), . \ )$ が以下の条件を満たすとき, $M$ を 右$R$加群と呼ぶ.

$(M, +_{\small M}, 0_{\small M}, -_{\small M})$ が可換群であるとは, 以下の条件を満たすことをいう.

- (二項演算の閉性) $M$ 上の閉じた二項演算（加法）$+_{\small M} : M \times M \to M$ が定まっている.

- (加法の結合法則) $x, y, z \in M$ に対し, $(x +_{\small M} y) +_{\small M} z = x +_{\small M} (y +_{\small M} z)$.

- (単位元の存在) ある $0_{\small M} \in M$ が存在して, $\forall x \in M, \ 0_{\small M} +_{\small M} x = x$. この $0_{\small M}$ を $M$ の 零元 という.

- (加法逆元の存在) 各 $x \in M$ にその加法逆元を与える単項演算 $-_{\small M} : M \to M$ が定まっていて, 任意の $x \in M$ に対し, $(-_{\small M} x) +_{\small M} x = 0_{\small M}$ を満たす. この $-_{\small M} x$ を $x$ の 逆元 という.

- (加法の可換性) $\forall x, y \in M, \ x +_{\small M} y = y +_{\small M} x$.

$(R, +_{\small R},0,-_{\small R}, \cdot_{\small R}, 1_{\small R})$ が単位的環であるとは, 以下の条件を満たすことをいう.

- (二項演算の閉性) $R$上の閉じた二項演算$+_{\small R}\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall a,b,c\in R, (a+_{\small R}b)+_{\small R}c=a+_{\small R}(b+_{\small R}c) \end{align*}
$$

- (零元の存在)加法単位元$0_{\small R}\in R$が存在して

$$
\begin{align*} \forall a\in R,\quad a+_{\small R}0_{\small R}=a \end{align*}
$$

- (加法逆元の存在)$R$上の閉じた単項演算$-_R\colon R\to R;\ a\mapsto -_Ra$が存在して

$$
\begin{align*} \forall a\in R,\quad a+_{\small R}(-_{\small R}a)=0_{\small R} \end{align*}
$$

- (加法の可換性)次の加法に関する交換法則が成り立つ.

$$
\begin{align*} \forall a,b\in R,\quad a+_{\small R}b=b+_{\small R}a \end{align*}
$$

- $R$上の閉じた二項演算$\cdot_{\small R}\;\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall a,b,c\in R,\quad (a\cdot_{\small R} b)\cdot_{\small R} c=a\cdot_{\small R} (b\cdot_{\small R} c) \end{align*}
$$

- (乗法単位元の存在)乗法単位元$1_{\small R}\in R$が存在して

$$
\begin{align*} \forall a\in R,\quad a\cdot_{\small R} 1_{\small R}=1_{\small R}\cdot_{\small R} a=a \end{align*}
$$

乗法$\cdot_{\small R}\;\colon R\times R\to R$は双加法的である. すなわち以下が成り立つ.

- (左分配法則) 各 $a \in R$ に対し, 左乗法写像 $R \to R \ (b \mapsto a \cdot_{\small R} b)$ は加法群 $(R, +_{\small R}, 0_{\small R}, -_{\small R})$ の準同型である. すなわち

$$
\begin{align*} \forall a, b, c \in R,\ a\cdot_{\small R}(b +_{\small R} c) = a\cdot_{\small R} b +_{\small R} a\cdot_{\small R} c \end{align*}
$$

- (右分配法則) 各 $c \in R$ に対し, 右乗法写像 $R \to R \ (b \mapsto b \cdot_{\small R} c)$ は加法群 $(R, +_{\small R}, 0_{\small R}, -_{\small R})$ の準同型である. すなわち

$$
\begin{align*} \forall a, b, c \in R,\ (a +_{\small R} b)\cdot_{\small R} c = a\cdot_{\small R} c +_{\small R} b\cdot_{\small R} c \end{align*}
$$

写像 $\mathbin{.}: M \times R \to M$ が単位的環作用であるということは以下の条件を満たすことをいう.

- $\forall a, b \in R, \ \forall x \in M$ に対し, $x.(a \cdot b) = (x.a).b$

- 環 $R$ の乗法単位元 $1_{\small R}$ に対し, $\forall x \in M, \ x.1_{\small R} = x$

- $\forall a, b \in R, \ \forall x \in M$ に対し, $x.(a +_{\small R} b) = x.a +_{\small M} x.b$

- $\forall a \in R, \ \forall x, y \in M$ に対し, $(x +_{\small M} y).a = x.a +_{\small M} y.a$

定義 3 (両側(R,S)加群) $R, S$を単位的環とする. 集合$M$と環$R, S$ の組$((M, +_{\small M}, 0_{\small M}, -_{\small M}), (R, +_{\small R},0_{\small R}, -_{\small R}, \cdot_{\small R}, 1_{\small R}), (S, +_{\small S},0_{\small S}, -_{\small S}, \cdot_{\small S}, 1_{\small S}), \mathbin{._l}, \mathbin{._r})$ が以下の条件を満たすとき, $M$ を 両側$(R,S)$加群と呼ぶ.

$(M, +_{\small M}, 0_{\small M}, -_{\small M})$ が可換群であるとは, 以下の条件を満たすことをいう.

- (二項演算の閉性) $M$ 上の閉じた二項演算（加法）$+_{\small M} : M \times M \to M$ が定まっている.

- (加法の結合法則) $x, y, z \in M$ に対し, $(x +_{\small M} y) +_{\small M} z = x +_{\small M} (y +_{\small M} z)$.

- (単位元の存在) ある $0_{\small M} \in M$ が存在して, $\forall x \in M, \ 0_{\small M} +_{\small M} x = x$. この $0_{\small M}$ を $M$ の 零元 という.

- (加法逆元の存在) 各 $x \in M$ にその加法逆元を与える単項演算 $-_{\small M} : M \to M$ が定まっていて, 任意の $x \in M$ に対し, $(-_{\small M} x) +_{\small M} x = 0_{\small M}$ を満たす. この $-_{\small M} x$ を $x$ の 逆元 という.

- (加法の可換性) $\forall x, y \in M, \ x +_{\small M} y = y +_{\small M} x$.

$(R, +_{\small R},0_{\small R}, -_{\small R}, \cdot_{\small R}, 1_{\small R})$が単位的環であるとは, それぞれ以下の条件を満たすことをいう. $(S, +_{\small S},0_{\small S}, -_{\small S}, \cdot_{\small S}, 1_{\small S})$についても全く同様の条件を満たす.

- (二項演算の閉性) $R$上の閉じた二項演算$+_{\small R}\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall a,b,c\in R, (a+_{\small R}b)+_{\small R}c=a+_{\small R}(b+_{\small R}c) \end{align*}
$$

- (零元の存在)加法単位元$0_{\small R}\in R$が存在して

$$
\begin{align*} \forall a\in R,\quad a+_{\small R}0_{\small R}=a \end{align*}
$$

- (加法逆元の存在)$R$上の閉じた単項演算$-_R\colon R\to R;\ a\mapsto -_Ra$が存在して

$$
\begin{align*} \forall a\in R,\quad a+_{\small R}(-_{\small R}a)=0_{\small R} \end{align*}
$$

- (加法の可換性)次の加法に関する交換法則が成り立つ.

$$
\begin{align*} \forall a,b\in R,\quad a+_{\small R}b=b+_{\small R}a \end{align*}
$$

- $R$上の閉じた二項演算$\cdot_{\small R}\;\colon R\times R\to R$が定まっている.

- (結合法則) 次の結合法則が成り立つ.

$$
\begin{align*} \forall a,b,c\in R,\quad (a\cdot_{\small R} b)\cdot_{\small R} c=a\cdot_{\small R} (b\cdot_{\small R} c) \end{align*}
$$

- (乗法単位元の存在)乗法単位元$1_{\small R}\in R$が存在して

$$
\begin{align*} \forall a\in R,\quad a\cdot_{\small R} 1_{\small R}=1_{\small R}\cdot_{\small R} a=a \end{align*}
$$

乗法$\cdot_{\small R}\;\colon R\times R\to R$は双加法的である. すなわち以下が成り立つ.

- (左分配法則) 各 $a \in R$ に対し, 左乗法写像 $R \to R \ (b \mapsto a \cdot_{\small R} b)$ は加法群 $(R, +_{\small R}, 0_{\small R}, -_{\small R})$ の準同型である. すなわち

$$
\begin{align*} \forall a, b, c \in R,\ a\cdot_{\small R}(b +_{\small R} c) = a\cdot_{\small R} b +_{\small R} a\cdot_{\small R} c \end{align*}
$$

- (右分配法則) 各 $c \in R$ に対し, 右乗法写像 $R \to R \ (b \mapsto b \cdot_{\small R} c)$ は加法群 $(R, +_{\small R}, 0_{\small R}, -_{\small R})$ の準同型である. すなわち

$$
\begin{align*} \forall a, b, c \in R,\ (a +_{\small R} b)\cdot_{\small R} c = a\cdot_{\small R} c +_{\small R} b\cdot_{\small R} c \end{align*}
$$

写像 $\mathbin{._l}: R \times M \to M$ が単位的環作用であるということは以下の条件を満たすことをいう.

- $\forall a, b \in R, \ \forall x \in M$ に対し, $(a \cdot_{\small R} b)._l x = a._l (b._l x)$

- 環 $R$ の乗法単位元 $1_{\small R}$ に対し, $\forall x \in M, \ 1_{\small R}._l x = x$

- $\forall a, b \in R, \ \forall x \in M$ に対し, $(a +_{\small R} b)._l x = a._l x +_{\small M} b._l x$

- $\forall a \in R, \ \forall x, y \in M$ に対し, $a._l (x +_{\small M} y) = a._l x +_{\small M} a._l y$

写像 $\mathbin{._r}: M \times S \to M$ が単位的環作用であるということは以下の条件を満たすことをいう.

- $\forall c, d \in S, \ \forall x \in M$ に対し, $x._r (c \cdot_{\small S} d) = (x._r c)._r d$

- 環 $S$ の乗法単位元 $1_{\small S}$ に対し, $\forall x \in M, \ x._r 1_{\small S} = x$

- $\forall c, d \in S, \ \forall x \in M$ に対し, $x._r (c +_{\small S} d) = x._r c +_{\small M} x._r d$

- $\forall c \in S, \ \forall x, y \in M$ に対し, $(x +_{\small M} y)._r c = x._r c +_{\small M} y._r c$

$\forall a \in R, \ \forall c \in S, \ \forall x \in M,\ (a ._l x) ._r c = a ._l (x ._r c)$

### 右加群, 両側加群の左加群への帰着

一般に加群の作用は左作用, 右作用そして両側作用が定義される. しかしいずれの場合も左作用に帰着することができるので, 単一の加群について考察する場合, 本質的には左加群を考えれば十分である. 一方, 複数の加群の考察を行う場合には右加群や両側加群を考える必要がある. そこで以降は単に$R$加群と言えば左$R$加群を指し, 右加群や両側加群を考える際はその旨を明示することとする.

まず右$R$加群$M$の作用が$M\times R\to M; (x,a)\mapsto x._r a$として定義されているとする. このとき, $R$の反対環$(R^{\mathrm{op}},\circ_{\mathrm{op}})$を考えることで, 左作用$R^{\mathrm{op}}\times M\to M$を$(a,x)\mapsto a._l x:=x._r a$として定義することができる. 実際, 反対環$R^{\mathrm{op}}$における演算は$a\circ_{\mathrm{op}} b:=ba$として定まっているので

$$
\begin{align*} (a\circ_{\mathrm{op}} b)._l x=x._r(ba)=(x._r b)._r a=a._l(b._l x) \end{align*}
$$

となり左作用の条件を満たしている. このようにして右$R$加群$M$は左$R^{\mathrm{op}}$加群と見なすことができる. また, $R$が可換環であれば$R^{\mathrm{op}}=R$であるから, 右$R$加群は左$R$加群と見なすことができる.

次に両側$(R,S)$加群$M$の作用が$R\times M\to M; (a,x)\mapsto a._l x$および$M\times S\to M; (x,c)\mapsto x._r c$として定義されているとする. このとき, $S$の反対環$(S^{\mathrm{op}},\circ_{\mathrm{op}})$を考える. $R,S^{\mathrm{op}}$の環のテンソル積$R\otimes_{\mathbb{Z}} S^{\mathrm{op}}$の普遍性によって, 左作用$R\otimes_{\mathbb{Z}} S^{\mathrm{op}}\times M\to M$を次のように定義することができる.

$$
\begin{align*} (a\otimes b, x)\longmapsto a._l(x._r b) \end{align*}
$$

このようにして両側$(R,S)$加群$M$は左$R\otimes_{\mathbb{Z}} S^{\mathrm{op}}$加群と見なすことができる.

### 加群における係数環の作用と環準同型の対応

$M$を左$R$加群とする. このとき次の対応によって環準同型写像$\rho\colon R\to \operatorname{End}(M)$が定まる.

$$
\begin{align*} \rho(a)\colon x\longmapsto ax \quad (a\in R, x\in M) \end{align*}
$$

実際, 環準同型写像であることは次のようにして分かる.

$$
\begin{align*} \rho(a+b)(x)&=(a+b)x=ax+bx=\rho(a)(x)+\rho(b)(x) \\ \rho(ab)(x)&=(ab)x=a(bx)=(\rho(a)\circ\rho(b))(x) \end{align*}
$$

逆に, 環準同型写像$\rho\colon R\to \operatorname{End}(M)$が与えられたとすると, $R$の$M$への左作用を次のように定めることで$M$は左$R$加群となる.

$$
\begin{align*} ax:=\rho(a)(x) \quad (a\in R, x\in M) \end{align*}
$$

このようにして左$R$加群$M$を定めることと環準同型写像$R\to \operatorname{End}(M)$を定めることは一対一対応する.

同様にして, 右$R$加群$M$を定めることと環の反準同型写像$R\to \operatorname{End}(M)$(または環準同型写像$R^{\mathrm{op}}\to \operatorname{End}(M)$)を定めること, 両側加群$M$を定めることと環準同型写像$R\otimes_{\mathbb{Z}} S^{\mathrm{op}}\to \operatorname{End}(M)$を定めることは一対一対応する.

### 定義から従う基本的な命題

命題 4 $R$を環, $M$を左$R$加群とするとき次が成り立つ.

- 任意の$a\in R$に対し, $a0=0$.

- 任意の$x\in M$に対し, $0x=0$.

証明.

- $a0=a(0+0)=a0+a0$であるから, この両辺に$-(a0)$を加えることで$0=a0$を得る.

- $0x=(0+0)x=0x+0x$であるから, この両辺に$-(0x)$を加えることで$0=0x$を得る.

◻

注釈 線形空間では$ax=0$ならば$a=0$または$x=0$であった. しかし$R$加群$M$では係数環$R$が零因子を持つ場合や, $M$が捩れを持つ場合があるため成り立たない.

このように$a\in R$であって, ある$0$でない$x\in M$に対して$ax=0$となるものは$M$-非正則元と呼ばれる.

命題 5 任意の$a\in R$, $x\in M$に対して, 以下が成り立つ.

- $(-a)x=-(ax)$

- $a(-x)=-(ax)$

証明.

- $ax + (-a)x$ を計算する. 分配法則および逆元の定義より,

$$
ax + (-a)x = (a + (-a))x = 0x = \mathbf{0}.
$$

加法逆元の一意性より, $(-a)x = -(ax)$.

- $ax + a(-x)$ を計算する. 分配法則および逆元の定義より,

$$
ax + a(-x) = a(x + (-x)) = a\mathbf{0} = \mathbf{0}.
$$

加法逆元の一意性より, $a(-x) = -(ax)$.

◻
