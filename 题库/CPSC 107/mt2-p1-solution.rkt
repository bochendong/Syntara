;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname mt2-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment 107/exams/2025w2-mt2/mt2-p1) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line

#|

Consider the following data definitions. Refer to mt2-p1-2-figure.pdf
for a graphical representation of S13, which is defined below: 

|#

(@htdd Song ListOfSong Playlist)
(define-struct song (name key album playlist))
(define-struct playlist (name danceability songs))
;; Song is (make-song String String String Playlist)
;; interp. a song with:
;;    name      
;;    key of the song 
;;    name of album
;;    a recommended playlist to check out
;;
;; ListOfSong is one of:
;; - empty
;; - (cons Song ListOfSong)
;; interp. a list of songs
;;
;; Playlist is (make-playlist String Natural ListOfSong)
;; interp. Playlist with:
;;    name
;;    danceability rating [1,100] from least to most
;;    songs in the playlist 
(define P0 (make-playlist "" 0 empty))
(define S0 (make-song "From The Start" "D-flat major" "Bewitched" P0))

(define S1 (make-song "Happily Ever After" "F minor"
                      "The Name Chapter: Freefall" P0))
(define S2 (make-song "September" "A major"
                      "The Best of Earth, Wind & Fire, Vol. 1" P0))
(define P1 (make-playlist "Road Trip!" 70 (list S0 S1 S2)))

(define S3 (make-song "If I Ain't Got You" "G major"
                      "The Diary of Alicia Keys" P0))
(define S4 (make-song "Alley Rose" "G major" "Found Heaven" P0))
(define S5 (make-song "eternal sunshine" "A major" "Eternal Sunshine" P0))
(define S6 (make-song "Calling You Back" "C major" "CINEMA" P0))
(define P4 (make-playlist "People Watching in Cafe" 85
                          (list S3 S4 S5 S6)))

(define S7 (make-song "(They Long to Be) Close to You" "G major"
                      "Close to You" P0))
(define P2 (make-playlist "cozyy" 10 (list S7)))

(define S8 (make-song "A Pearl" "A-flat major" "Be the Cowboy" P0))
(define S9 (make-song "Birds of a feather" "D major" "Hit Me Hard and Soft" P1))
(define S10 (make-song "Heather" "F major" "Kid Krow" P2))

(define P3 (make-playlist "jazz" 25 empty))
(define S11 (make-song "The Thrill Is Gone" "C minor" "Chet Baker Sings" P3))

(define S12 (make-song "Purple Rain" "B-flat major"
                       "Prince and The Revolution - Sixth Studio Album" P4))
(define P5 (make-playlist "Midnight Walks" 90
                          (list S8 S9 S10 S11 S12)))

(define S13 (make-song "Spring Day" "E-flat major" "You Never Walk Alone" P5))

(@template-origin encapsulated Playlist ListOfSong Song)

(define (fn-for-song s0)
  (local [(define (fn-for-song s)
            (... (song-name s)
                 (song-key s)
                 (song-album s)
                 (fn-for-playlist (song-playlist s))))

          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-song (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-playlist p)
            (... (playlist-name p)
                 (playlist-danceability p)
                 (fn-for-los (playlist-songs p))))]
    
    (fn-for-song s0)))

#|

Complete the design of the following abstract fold function for Song.
Note that we have already given you the actual function definition and the
template origin tag. You must complete the design with a signature, purpose, and
the following TWO check-expects:

  - use the fold function to produce a COPY of S13 
  - use the fold function to COUNT the number of NAMED playlists (visible in
    figure) reachable from S13, which is 5   

Be VERY CAREFUL WRITING THE SIGNATURE. The autograder is very picky about
these problems. If you skip the type of one parameter then the types of all
following parameters will probably be marked wrong. On the other hand an
incorrect type typically does not affect anything after it. So work very
carefully to first setup the number of parameters the function has, and be
sure your final answer has types for that many parameters. There are 5.

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

  - Files must not have any errors when the Check Syntax button is pressed.
    Press Check Syntax and Run often, and correct any errors early.

  - You must not edit or comment out the provided @htdf tag.

  - You MUST NOT edit the provided fold-song function definition or
    the template origin tag.
|#

(@htdf fold-song)
(@signature (String String String Z -> X) (X Y -> Y)
            (String Natural Y -> Z) Y Song -> X)
;; abstract fold for song
(check-expect (fold-song make-song cons make-playlist empty S13) S13)
(check-expect (local [(define (add-playlist n m rmr)
                        (if (string=? n "")
                            rmr
                            (add1 rmr)))]
                (fold-song (λ (n d a rmr) rmr) + add-playlist 0 S13)) 5)
                          
(@template-origin encapsulated Playlist ListOfSong Song)

(define (fold-song c1 c2 c3 b s0)
  (local [(define (fn-for-song s) ; -> X
            (c1 (song-name s)
                (song-key s)
                (song-album s)
                (fn-for-playlist (song-playlist s))))

          (define (fn-for-los los) ; -> Y
            (cond [(empty? los) b]
                  [else
                   (c2 (fn-for-song (first los))
                       (fn-for-los (rest los)))]))

          (define (fn-for-playlist p) ; -> Z
            (c3 (playlist-name p)
                (playlist-danceability p)
                (fn-for-los (playlist-songs p))))]
    
    (fn-for-song s0)))