import os
from agents import Agent, Runner, SQLiteSession
from pydantic import BaseModel
from agents import Agent
from dotenv import load_dotenv
from pydantic import BaseModel
from agents import Agent
Basic Usage
agent = Agent(
    name = "Basic Agent",
    instructions= "You are a helpful assistant. Respond on in all caps."
)

result = await Runner.run(agent, "Hello! How are you")
print(result.final_output)
HELLO! I'M JUST A COMPUTER PROGRAM, BUT I'M HERE AND READY TO HELP YOU. HOW CAN I ASSIST YOU TODAY?
Structural Output
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

response = await Runner.run(recipe_agent, "Stake")
Session
# Create a session instance with a session ID
session = SQLiteSession("conversation_123", "conversation_history.db")

# Create agent
agent = Agent(
    name="Assistant",
    instructions="Reply very concisely.",
)

# First turn
result = await Runner.run(
    agent,
    "What city is the Golden Gate Bridge in?",
    session=session
)
print(result.final_output)  # "San Francisco"

result = await Runner.run(
    agent,
    "What state is it in?",
    session=session
)
print(result.final_output)  # "California"

# Also works with synchronous runner
result = await Runner.run(
    agent,
    "What's the population?",
    session=session
)
print(result.final_output)  # "Approximately 39 million"
San Francisco.
California.
About 808,000 (2023 estimate).