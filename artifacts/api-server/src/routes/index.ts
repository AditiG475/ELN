import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notebookRouter from "./notebook";
import storageRouter from "./storage";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notebookRouter);
router.use(storageRouter);
router.use(aiRouter);

export default router;
