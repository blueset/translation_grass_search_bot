"use client";

import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    window.location.href = "https://t.me/trnsln_grass_search_bot";
  }, []);

  return (
    <h1>Redirecting to <a href="https://t.me/trnsln_grass_search_bot">https://t.me/trnsln_grass_search_bot</a>...</h1>
  )
}
