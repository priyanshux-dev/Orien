import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    base_url=os.environ["AI_BASE_URL"],
    api_key=os.environ["AI_API_KEY"],
)

reply = client.chat.completions.create(
    model=os.environ["AI_MODEL"],
    messages=[{"role": "user", "content": "Say hello in 5 words."}],
)

print(reply.choices[0].message.content)
print("finish_reason:", reply.choices[0].finish_reason)