import { Composition } from 'remotion';
import { MainComposition } from './MainComposition';

export const RemotionVideo: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
