from agents import (
    Runner,
    function_tool,
    RunContextWrapper,
    Agent
)
from dataclasses import asdict, dataclass, field
import asyncio


@dataclass
class SectionContext:
    definition: str
    examples: str

@function_tool
async def after_definition(context: RunContextWrapper[SectionContext], definition_text: str, msg: str):
    section_context = context.context

    example_agent = Agent(
        name = "example_agent",
        instructions=f"给你一些主题, 你要会写examples, 这是给你的主题{definition_text}, {msg}",
        tools = []
    )
    response = await Runner.run(example_agent, msg, context=section_context if section_context else context)
    
    section_context.examples = response.final_output

    return "Success"

@function_tool
async def start_writting(context: RunContextWrapper[SectionContext], msg: str):
    # Get真正的 SectionContext Object
    section_context = context.context
    
    definition_agent = Agent(
        name = "definition_agent",
        instructions="""你是专门写definition的agent。请按以下步骤工作：
        1. 首先完成 definition 的编写
        2. 写完之后，调用 after_definition 工具，并将你刚写的 definition 内容作为 definition_text Parameter传递，同When将需要生成的题型信息作为 msg Parameter传递
        3. 在调用 after_definition When，请确保传递完整的 definition 内容""",
        tools = [after_definition]
    )
    response = await Runner.run(definition_agent, msg, context=section_context if section_context else context)
    
    section_context.definition = response.final_output

    return "Success"

section_agent = Agent(
    name="section agent",
    instructions="你是专门写笔记本的一个section的agent, 请直接call start_writting, 你只需要告诉他写什么主题就行",
    tools = [start_writting]
    )

async def main():
    sc = SectionContext(definition = "", examples = "")

    result = await Runner.run(
                    section_agent,
                    "生成关于FunctionDefine域Value域的笔记",
                    context = sc,
                )

    print(result.final_output)

    print(sc)

if __name__ == "__main__":
    asyncio.run(main())