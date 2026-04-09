"use client";

import { Utensils } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MealBars } from "../DashboardClient";

interface DashboardMealsProps {
  meals: { name: string; count: number }[];
}

export function DashboardMeals({ meals }: DashboardMealsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionHeader title="Meal choices" href="/guests" />
      <div className="mt-4">
        {meals.length === 0 ? (
          <EmptyState
            icon={Utensils}
            title="No meal choices yet"
            description="Meal selections will appear as guests RSVP"
          />
        ) : (
          <MealBars meals={meals} />
        )}
      </div>
    </div>
  );
}