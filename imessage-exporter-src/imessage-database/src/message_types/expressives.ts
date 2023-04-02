enum BubbleEffect {
    Slam,
    Loud,
    Gentle,
    InvisibleInk,
}

enum ScreenEffect {
    Confetti,
    Echo,
    Fireworks,
    Balloons,
    Heart,
    Lasers,
    ShootingStar,
    Sparkles,
    Spotlight,
}

type Expressive = {
    kind: 'Screen' | 'Bubble' | 'Unknown' | 'None',
    screenEffect?: ScreenEffect,
    bubbleEffect?: BubbleEffect,
    unknownValue?: string,
};