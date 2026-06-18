;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p6) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line

;;
;; Consider the following data definition for a graph, which is QUITE SIMILAR
;; to one you saw earlier this term.  Note that the sample graph, shown in
;; f-p6-figure.pdf is different than what you saw previously.
;;

;; =================
;; Data Definitions: 

(@htdd Node)
(define-struct node (number nexts))
;; Node is (make-node Integer (listof Integer))
;; interp. node's number, and list of numbers of nodes that the arrows point to

(define N101 (make-node 101 (list 102 107 108)))


#|
 A Map is AN OPAQUE DATA STRUCTURE that represents one or more distinct graphs.
 OPAQUE means you can't look inside it.  THE ONLY THING YOU ARE  ALLOWED TO DO
 WITH A MAP IS PASS IT TO generate-node.

 generate-node is defined at the bottom of the file. You should treat it as a
 primitive function described as follows:

(@htdf generate-node)
(@signature Map Integer -> Node)

 If a node with the given number exists in map then produce it.
 Signal an error if no node with the given number exists in the map.

 The bottom of the file defines a map called MAP for the graphs shown in
 this figure:

   https://cs110.students.cs.ubc.ca/exams/2024w2-f/f-p6-figure.pdf
 
 But the functions you design must work for any map and you should expect
 that the grader will call your functions with different maps.
|#

;;
;; Here is a natural recursion template.
;;

(@template-origin encapsulated Node (listof Integer) genrec)
#;
(define (fn-for-graph/nr start the-map)
  (local [(define (fn-for-node n)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn nexts)])))
          
          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (fn-for-node (generate-node map (first lonn)))
                        (fn-for-lonn (rest lonn)))]))]
    
    (fn-for-? ...start)))



#|

 In this problem you have the choice of completing the design of ONE of two
 similar, but still different functions.
  
  - The second function is worth 10% more than the first function.
  - You may do both, the grader will automatically take the best.
  - BUT BE CAREFUL. If the file has red errors then the entire file will
    get 0. So if you try doing the second function and you are getting
    red errors, be sure to clean things up so your first function can be
    graded.

 Both functions consume start and end node numbers, and a map called the-map.

 Both functions search for a path from the start node to the end node,
 where the path can only go through nodes with numbers > than the sum of
 the path to that node.  Be sure to carefully study the pictures and the
 supplied tests to be sure you understand what this means.

 If the first function finds such a path it produces the path at that point.

 If the second function finds such a path it produces the visited at that point.


NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function(s) you design MUST have the names specified below.
 
 - You MUST NOT delete or comment out any given metadata tags or check-expects.
 
 - You may add additional tests.
 
 - Your solution must be based on the encapsulated template provided above.
   You will of course have to make additions and changes to those templates.

 - You must not rename any of the local functions in the templates.

 - You may add additional arguments to those local functions.

 - You must not delete or comment out any local functions in the templates.

 - Your submission MUST PASS the Check Syntax button.

 - You MUST FOLLOW all applicable design rules and include all required
   metadata tags.

|#


(@htdf find-psf-exceeding-path)
(@signature Integer Integer Map -> (listof Integer) or false)
;; find first path from start to end where each num is > than path total so far


;; (define (find-psf-exceeding-path start end the-map) false) ;stub

; (define-struct node (number nexts))
; (define-struct state (name neighbour))

(define (find-psf-exceeding-path start dest the-map)
  (local
    [(define (neighbour-function node path)
       (local
         [ ;; 我的neighbour都有谁
          (define NEXTS  (node-nexts (generate-node the-map node)))
          (define SUM  (+ node (foldr + 0 path)))
          ]
         (filter (lambda (x) (> x SUM)) NEXTS)
       ))
      
     (define (fn-for-node node path visited node-wl path-wl)
       (local
         [(define neighbours (neighbour-function node path))
          (define number node)]
         (cond
           [(equal? number dest) (append path (list number))]
           [(member? number visited)
            (fn-for-los node-wl path-wl visited)
            ]
           [else
            (fn-for-los (append neighbours node-wl) 
                        (append (make-list (length neighbours)
                                            (append path (list number)))
                                path-wl)
                        (cons number visited)) 
            ])))

     (define (fn-for-los node-wl path-wl visited)
       (cond
         [(empty? node-wl) false]
         [else (fn-for-node (first node-wl)
                             (first path-wl)
                             visited
                             (rest node-wl)
                             (rest path-wl))]))
     ]
    (fn-for-node start empty empty empty empty)))







;;
;; <<< DO NOT EDIT ANYTHING BELOW THIS LINE >>>
;;

(@htdd Map)
;; Map is OPAQUE structure described above.
;;
;; generate-node is a primitive described-above.
;;

(@htdf generate-node)
(@signature Map Integer -> Node)
;; Give map and node number (name), generate corresponding node
(define (generate-node map number)
  (local [(define entry (assoc number (unbox map)))]
    (if (false? entry)
        (error "Node with given number does not exist." number)
        (apply make-node entry))))





(define MAP
  (box '((4 (2 5))
         
         (2 (3 7))
         (5 (8))
         
         (3 (1))
         (7 (10))
         (8 ())
         
         (1 ())
         (10 ())

         
         (11  (25 20 -2000))
         
         (25  (35))
         (20  (35))
         (-2000  (200 3))

         (35  (71 82))
         (200 ())
         (3   ())
         
         (71  ())
         (82  (300 200))
         (300 ())

         )))


