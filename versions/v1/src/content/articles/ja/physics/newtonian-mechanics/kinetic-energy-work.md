---
articleId: ja-physics-kinetic-energy-work
locale: ja
title: 運動エネルギーと仕事
slug: kinetic-energy-work
subject: physics
category: newtonian-mechanics
concepts:
  - id: physics.newtonian-mechanics.kinetic-energy-work
authors:
  - atlas-physics-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 質点 の運動方程式を運動に沿って線積分することを考える。位置 から までの運動について、 の両辺を経路に沿って線積分すると、 より、 を得る。 …
difficulty: intermediate
estimatedMinutes: 5
tags:
  - 運動エネルギーと仕事
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

質点$i$の運動方程式を運動に沿って線積分することを考える。位置$\boldsymbol{r}_i(t_1)$から$\boldsymbol{r}_i(t_2)$までの運動について、$m_i\dvtwo{\boldsymbol{r}_i}{t}=\boldsymbol{F}_i(\boldsymbol{r}_i)$の両辺を経路に沿って線積分すると、

$$
\int_{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}m_i{\dvtwo{\boldsymbol{r}_i}{t}}\vdot\dd{\boldsymbol{r}_i}=\int_{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}\boldsymbol{F}_i\vdot\dd{\boldsymbol{r}_i}
$$

$$
\int_{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}m_i{\dvtwo{\boldsymbol{r}_i}{t}}\vdot\dd{\boldsymbol{r}_i}=m_i\int_{t_1}^{t_2}\dvtwo{\boldsymbol{r}_i}{t}\vdot\dv{\boldsymbol{r}_i}{t}\dd t=\frac{1}{2}m_i\int_{t_1}^{t_2}\dv{}{t}(\dv{\boldsymbol{r}_i}{t}\vdot\dv{\boldsymbol{r}_i}{t})\dd t=\frac{1}{2}m_i\int_{t_1}^{t_2}\dv{({v_i}^2)}{t}\dd t
$$

より、

$$
\frac{1}{2}m_i{v_i}^2(t_2)-\frac{1}{2}m_i{v_i}^2(t_1)=\int_{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}\boldsymbol{F}_i\vdot\dd{\boldsymbol{r}_i}
$$

を得る。 ここで、左辺は運動の境界時刻$t_1,\,t_2$の量$K_i:=\frac{1}{2}m{v_i}^2$の差であり、これを質点$i$の運動エネルギーと呼ぶ。右辺は力の線積分であり、この量$W_i^{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}=\int_{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}\boldsymbol{F}_i(\boldsymbol{r}_i)\vdot\dd{\boldsymbol{r}_i}$を質点$i$になされる仕事と呼ぶ。すなわち、

$$
K(t_2)-K(t_1)=W_i^{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}。
$$

運動エネルギーの時間微分は$\int_{C(\boldsymbol{r}_i(t_1)\to\boldsymbol{r}_i(t_2))}\boldsymbol{F}_i\vdot\dd{\boldsymbol{r}_i}=\int_{t_1}^{t_2}\boldsymbol{F}\vdot\boldsymbol{v}_i\dd{t}$より、$\dv{K_i}{t}=\boldsymbol{F}_i\vdot\boldsymbol{v}_i$で与えられる。$P_i=\boldsymbol{F}_i\vdot\boldsymbol{v}_i$を仕事率という。

上式は$K_i=\frac{1}{2}m_i{v_i}^2$を直接時間微分することでも求められる。$\dv{v}{t}=\dv{}{t}(\sqrt{{v_x}^2+{v_y}^2+{v_z}^2})=\frac{2v_x\dv{v_x}{t}+2v_y\dv{v_y}{t}+2v_z\dv{v_z}{t}}{2\sqrt{{v_x}^2+{v_y}^2+{v_z}^2}}=\frac{\boldsymbol{v}\vdot\boldsymbol{a}}{v}$より、$\dv{K_i}{t}=m_iv_i\dv{v_i}{t}=m_i\boldsymbol{a}_i\vdot\boldsymbol{v}_i=\boldsymbol{F}_i\vdot\boldsymbol{v}_i$。
