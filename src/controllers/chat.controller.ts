import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const sendMessage = async (req: any, res: Response) => {
  const { requestId, message } = req.body;
  const userId = req.userId;

  if (!requestId || !message) {
    return res.status(400).json({ success: false, message: 'Request ID and message are required' });
  }

  try {
    const chatMessage = await prisma.chatMessage.create({
      data: {
        requestId,
        senderId: userId,
        message,
      },
    });

    res.status(201).json({ success: true, data: chatMessage });
  } catch (error: any) {
    console.error('Send Message Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getMessages = async (req: any, res: Response) => {
  const { requestId } = req.params;

  try {
    const messages = await prisma.chatMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    console.error('Get Messages Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
