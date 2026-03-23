import os
import asyncio
from agents import Agent, Runner, SQLiteSession
from pydantic import BaseModel
from agents import Agent


class Recipe(BaseModel):
    title: str
    ingredients: list[str]
    cooking_time: int
    servings: int


recipe_agent = Agent(
    name = "recipe_agent",
    instructions=("You are an agent for creating recipes. You will be given the name of a food and your job"
                  "is to output that as an actual detailed recipe. The cooking time should be in minutes."),
    output_type=Recipe
)

async def main():
    response = await Runner.run(recipe_agent, "Stake")
    print(response.final_output)

if __name__ == "__main__":
    asyncio.run(main())