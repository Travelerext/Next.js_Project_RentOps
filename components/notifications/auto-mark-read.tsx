"use client";

import { useEffect } from "react";
import { markAllNotificationsRead } from "@/lib/actions/notification";

export function AutoMarkRead() {
  useEffect(() => { markAllNotificationsRead(); }, []);
  return null;
}
