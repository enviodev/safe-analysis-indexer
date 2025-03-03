import {
  ECR20,
  ECR20_Approval,
} from "generated";

ECR20.Approval.handler(async ({ event, context }) => {

  const entity: ECR20_Approval = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    owner: event.params.owner,
    spender: event.params.spender,
    value: event.params.value,
    token: event.srcAddress,    
    hash: event.transaction.hash,
  };
  

  context.ECR20_Approval.set(entity);
}, {wildcard: true});